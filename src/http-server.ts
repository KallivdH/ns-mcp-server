#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  isInitializeRequest,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { Config } from './config/index.js';
import { NSApiService } from './services/NSApiService.js';
import { ResponseFormatter } from './utils/ResponseFormatter.js';
import { isValidDisruptionsArgs, isValidTravelAdviceArgs, isValidDeparturesArgs, isValidOVFietsArgs, isValidStationInfoArgs, isValidArrivalsArgs, isValidPricesArgs } from './types.js';

class NSHttpServer {
  private server: Server;
  private nsApiService: NSApiService;
  private app: express.Application;
  private port: number;
  private transports: Map<string, StreamableHTTPServerTransport> = new Map();

  constructor() {
    const config = Config.getInstance();

    this.server = new Server(
      {
        name: config.serverName,
        version: config.serverVersion
      },
      { capabilities: { tools: {} } }
    );

    this.nsApiService = new NSApiService(config.nsApiKey);
    this.app = express();
    this.port = parseInt(process.env.PORT || '8081', 10);

    this.setupExpress();
    this.setupHandlers();
    this.setupErrorHandling();
  }

  private setupExpress(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // CORS headers
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.header('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version');

      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({ status: 'healthy', timestamp: new Date().toISOString() });
    });

    // MCP POST endpoint - handles initialization and messages
    this.app.post('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      try {
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.transports.has(sessionId)) {
          // Reuse existing transport for this session
          transport = this.transports.get(sessionId)!;
        } else if (!sessionId && isInitializeRequest(req.body)) {
          // New initialization request - create new transport
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => randomUUID(),
            onsessioninitialized: (sessionId: string) => {
              console.log(`Session initialized with ID: ${sessionId}`);
              this.transports.set(sessionId, transport);
            },
            onsessionclosed: (sessionId: string) => {
              console.log(`Session closed with ID: ${sessionId}`);
              this.transports.delete(sessionId);
            }
          });

          // Set up cleanup handler
          transport.onclose = () => {
            if (transport.sessionId) {
              this.transports.delete(transport.sessionId);
            }
          };

          // Connect the transport to the server
          await this.server.connect(transport);
        } else {
          res.status(400).json({ error: 'Invalid or missing session ID' });
          return;
        }

        // Handle the request through the transport
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        console.error('MCP endpoint error:', error);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      }
    });

    // MCP GET endpoint - establishes SSE stream for existing sessions
    this.app.get('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !this.transports.has(sessionId)) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      try {
        const transport = this.transports.get(sessionId)!;
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('SSE connection error:', error);
        if (!res.headersSent) {
          res.status(500).send('Error establishing SSE connection');
        }
      }
    });

    // MCP DELETE endpoint - terminates sessions
    this.app.delete('/mcp', async (req: Request, res: Response) => {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;

      if (!sessionId || !this.transports.has(sessionId)) {
        res.status(400).send('Invalid or missing session ID');
        return;
      }

      try {
        const transport = this.transports.get(sessionId)!;
        await transport.handleRequest(req, res);
      } catch (error) {
        console.error('Session termination error:', error);
        if (!res.headersSent) {
          res.status(500).send('Error processing session termination');
        }
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      console.log('Shutting down server...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('Shutting down server...');
      await this.server.close();
      process.exit(0);
    });
  }

  private setupHandlers(): void {
    this.setupToolHandlers();
  }

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'get_disruptions',
          description: 'Get comprehensive information about current and planned disruptions on the Dutch railway network. Returns details about maintenance work, unexpected disruptions, alternative transport options, impact on travel times, and relevant advice. Can filter for active disruptions and specific disruption types.',
          inputSchema: {
            type: 'object',
            properties: {
              isActive: {
                type: 'boolean',
                description: 'Filter to only return active disruptions',
              },
              type: {
                type: 'string',
                description: 'Type of disruptions to return (e.g., MAINTENANCE, DISRUPTION)',
                enum: ['MAINTENANCE', 'DISRUPTION']
              },
            },
          },
        },
        {
          name: 'get_travel_advice',
          description: 'Get detailed travel routes between two train stations, including transfers, real-time updates, platform information, and journey duration. Can plan trips for immediate departure or for a specific future time, with options to optimize for arrival time. Returns multiple route options with status and crowding information.',
          inputSchema: {
            type: 'object',
            properties: {
              fromStation: {
                type: 'string',
                description: 'Name or code of departure station',
              },
              toStation: {
                type: 'string',
                description: 'Name or code of destination station',
              },
              dateTime: {
                type: 'string',
                description: 'Format - date-time (as date-time in RFC3339). Datetime that the user want to depart from his origin or or arrive at his destination',
              },
              searchForArrival: {
                type: 'boolean',
                description: 'If true, dateTime is treated as desired arrival time',
              },
            },
            required: ['fromStation', 'toStation'],
          },
        },
        {
          name: 'get_departures',
          description: 'Get real-time departure information for trains from a specific station, including platform numbers, delays, route details, and any relevant travel notes. Returns a list of upcoming departures with timing, destination, and status information.',
          inputSchema: {
            type: 'object',
            properties: {
              station: {
                type: 'string',
                description: 'NS Station code for the station (e.g., ASD for Amsterdam Centraal). Required if uicCode is not provided',
              },
              uicCode: {
                type: 'string',
                description: 'UIC code for the station. Required if station code is not provided',
              },
              dateTime: {
                type: 'string',
                description: 'Format - date-time (as date-time in RFC3339). Only supported for departures at foreign stations. Defaults to server time (Europe/Amsterdam)',
              },
              maxJourneys: {
                type: 'number',
                description: 'Number of departures to return',
                minimum: 1,
                maximum: 100,
                default: 40
              },
              lang: {
                type: 'string',
                description: 'Language for localizing the departures list. Only a small subset of text is translated, mainly notes. Defaults to Dutch',
                enum: ['nl', 'en'],
                default: 'nl'
              }
            },
            oneOf: [
              { required: ['station'] },
              { required: ['uicCode'] }
            ]
          }
        },
        {
          name: 'get_ovfiets',
          description: 'Get OV-fiets availability at a train station',
          inputSchema: {
            type: 'object',
            properties: {
              stationCode: {
                type: 'string',
                description: 'Station code to check OV-fiets availability for (e.g., ASD for Amsterdam Centraal)',
              }
            },
            required: ['stationCode']
          }
        },
        {
          name: 'get_station_info',
          description: 'Get detailed information about a train station',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Station name or code to search for',
              },
              includeNonPlannableStations: {
                type: 'boolean',
                description: 'Include stations where trains do not stop regularly',
                default: false
              },
              limit: {
                type: 'number',
                description: 'Maximum number of results to return',
                minimum: 1,
                maximum: 50,
                default: 10
              }
            },
            required: ['query']
          }
        },
        {
          name: 'get_current_time_in_rfc3339',
          description: 'Get the current server time (Europe/Amsterdam timezone) in RFC3339 format. This can be used as input for other tools that require date-time parameters.',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'get_arrivals',
          description: 'Get real-time arrival information for trains at a specific station, including platform numbers, delays, origin stations, and any relevant travel notes. Returns a list of upcoming arrivals with timing, origin, and status information.',
          inputSchema: {
            type: 'object',
            properties: {
              station: {
                type: 'string',
                description: 'NS Station code for the station (e.g., ASD for Amsterdam Centraal). Required if uicCode is not provided',
              },
              uicCode: {
                type: 'string',
                description: 'UIC code for the station. Required if station code is not provided',
              },
              dateTime: {
                type: 'string',
                description: 'Format - date-time (as date-time in RFC3339). Only supported for arrivals at foreign stations. Defaults to server time (Europe/Amsterdam)',
              },
              maxJourneys: {
                type: 'number',
                description: 'Number of arrivals to return',
                minimum: 1,
                maximum: 100,
                default: 40
              },
              lang: {
                type: 'string',
                description: 'Language for localizing the arrivals list. Only a small subset of text is translated, mainly notes. Defaults to Dutch',
                enum: ['nl', 'en'],
                default: 'nl'
              }
            },
            oneOf: [
              { required: ['station'] },
              { required: ['uicCode'] }
            ]
          }
        },
        {
          name: 'get_prices',
          description: 'Get price information for domestic train journeys, including different travel classes, ticket types, and discounts. Returns detailed pricing information with conditions and validity.',
          inputSchema: {
            type: 'object',
            properties: {
              fromStation: {
                type: 'string',
                description: 'UicCode or station code of the origin station',
              },
              toStation: {
                type: 'string',
                description: 'UicCode or station code of the destination station',
              },
              travelClass: {
                type: 'string',
                description: 'Travel class to return the price for',
                enum: ['FIRST_CLASS', 'SECOND_CLASS']
              },
              travelType: {
                type: 'string',
                description: 'Return the price for a single or return trip',
                enum: ['single', 'return'],
                default: 'single'
              },
              isJointJourney: {
                type: 'boolean',
                description: 'Set to true to return the price including joint journey discount',
                default: false
              },
              adults: {
                type: 'integer',
                description: 'Number of adults to return the price for',
                minimum: 1,
                default: 1
              },
              children: {
                type: 'integer',
                description: 'Number of children to return the price for',
                minimum: 0,
                default: 0
              },
              routeId: {
                type: 'string',
                description: 'Specific identifier for the route to take between the two stations. This routeId is returned in the /api/v3/trips call.'
              },
              plannedDepartureTime: {
                type: 'string',
                description: 'Format - date-time (as date-time in RFC3339). Used to find the correct route if multiple routes are possible.'
              },
              plannedArrivalTime: {
                type: 'string',
                description: 'Format - date-time (as date-time in RFC3339). Used to find the correct route if multiple routes are possible.'
              }
            },
            required: ['fromStation', 'toStation']
          }
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const rawArgs = request.params.arguments || {};

      try {
        switch (request.params.name) {
          case 'get_disruptions': {
            if (!isValidDisruptionsArgs(rawArgs)) {
              throw ResponseFormatter.createMcpError(
                ErrorCode.InvalidParams,
                'Invalid arguments for get_disruptions'
              );
            }
            const data = await this.nsApiService.getDisruptions(rawArgs);
            return ResponseFormatter.formatSuccess(data);
          }

          case 'get_travel_advice': {
            if (!isValidTravelAdviceArgs(rawArgs)) {
              throw ResponseFormatter.createMcpError(
                ErrorCode.InvalidParams,
                'Invalid arguments for get_travel_advice'
              );
            }
            const data = await this.nsApiService.getTravelAdvice(rawArgs);
            return ResponseFormatter.formatSuccess(data);
          }

          case 'get_departures': {
            if (!isValidDeparturesArgs(rawArgs)) {
              throw ResponseFormatter.createMcpError(
                ErrorCode.InvalidParams,
                'Invalid arguments for get_departures'
              );
            }
            const data = await this.nsApiService.getDepartures(rawArgs);
            return ResponseFormatter.formatSuccess(data);
          }

          case 'get_ovfiets': {
            if (!isValidOVFietsArgs(rawArgs)) {
              throw ResponseFormatter.createMcpError(
                ErrorCode.InvalidParams,
                'Invalid arguments for get_ovfiets'
              );
            }
            const data = await this.nsApiService.getOVFiets(rawArgs);
            return ResponseFormatter.formatSuccess(data);
          }

          case 'get_station_info': {
            if (!isValidStationInfoArgs(rawArgs)) {
              throw ResponseFormatter.createMcpError(
                ErrorCode.InvalidParams,
                'Invalid arguments for get_station_info'
              );
            }
            const data = await this.nsApiService.getStationInfo(rawArgs);
            return ResponseFormatter.formatSuccess(data);
          }

          case 'get_current_time_in_rfc3339': {
            const now = new Date();
            return ResponseFormatter.formatSuccess({
              datetime: now.toISOString(),
              timezone: 'Europe/Amsterdam'
            });
          }

          case 'get_arrivals': {
            if (!isValidArrivalsArgs(rawArgs)) {
              throw ResponseFormatter.createMcpError(
                ErrorCode.InvalidParams,
                'Invalid arguments for get_arrivals'
              );
            }
            const data = await this.nsApiService.getArrivals(rawArgs);
            return ResponseFormatter.formatSuccess(data);
          }

          case 'get_prices': {
            if (!isValidPricesArgs(rawArgs)) {
              throw ResponseFormatter.createMcpError(
                ErrorCode.InvalidParams,
                'Invalid arguments for get_prices'
              );
            }
            const data = await this.nsApiService.getPrices(rawArgs);
            return ResponseFormatter.formatSuccess(data);
          }

          default:
            throw ResponseFormatter.createMcpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error) {
        return ResponseFormatter.formatError(error);
      }
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = this.app.listen(this.port, '0.0.0.0', () => {
        console.log(`NS MCP Server listening on port ${this.port}`);
        console.log(`Health check: http://localhost:${this.port}/health`);
        console.log(`MCP endpoint: http://localhost:${this.port}/mcp`);
        resolve();
      });

      server.on('error', (error) => {
        console.error('Failed to start server:', error);
        reject(error);
      });
    });
  }
}

const server = new NSHttpServer();
server.start().catch(console.error);
