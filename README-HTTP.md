# NS MCP Server - HTTP/Streamable Version

This version of the NS MCP Server has been modified to support streamable HTTP for deployment on Smithery.ai custom containers.

## Changes Made

### 1. New HTTP Server (`src/http-server.ts`)
- Implements Express.js HTTP server
- Uses SSEServerTransport for streaming MCP protocol over HTTP
- Listens on configurable PORT (default: 8081)
- Implements proper CORS headers for cross-origin requests
- Includes `/health` endpoint for health checks
- Implements `/mcp` endpoint for MCP protocol communication

### 2. Configuration Files

#### `smithery.yaml`
- Defines runtime as `container`
- Specifies Dockerfile for building
- Configures NS_API_KEY as required parameter
- Includes metadata for Smithery platform

#### Updated `Dockerfile`
- Exposes port 8081
- Changed entrypoint to run `http-server.js` instead of `index.js`

#### Updated `package.json`
- Added `express` and `@types/express` dependencies
- Added `start:http` script to run HTTP server
- Updated build script to make http-server.js executable

### 3. Key Features

**CORS Configuration:**
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization`
- `Access-Control-Expose-Headers: mcp-session-id, mcp-protocol-version`

**Endpoints:**
- `GET /health` - Health check endpoint
- `POST /mcp` - MCP protocol endpoint (streamable HTTP)

**Environment Variables:**
- `PORT` - HTTP server port (default: 8081)
- `NS_API_KEY` - NS API key for accessing railway data

## Deployment

### Local Testing

1. Install dependencies:
```bash
npm install
```

2. Build the project:
```bash
npm run build
```

3. Set environment variable:
```bash
export NS_API_KEY="your-api-key-here"
```

4. Run HTTP server:
```bash
npm run start:http
```

5. Test health endpoint:
```bash
curl http://localhost:8081/health
```

### Docker Testing

1. Build Docker image:
```bash
docker build -t ns-mcp-server .
```

2. Run container:
```bash
docker run -p 8081:8081 -e NS_API_KEY="your-api-key-here" ns-mcp-server
```

3. Test:
```bash
curl http://localhost:8081/health
```

### Smithery Deployment

1. Ensure `smithery.yaml` is in repository root
2. Push changes to GitHub
3. Deploy via Smithery platform UI
4. Configure `NS_API_KEY` in deployment settings

## Original STDIO Version

The original STDIO version remains available in `src/index.ts` and can still be used for local MCP server installations via Claude Desktop or other STDIO-based MCP clients.

## API Endpoints

All original NS API tools are available:
- `get_disruptions` - Railway disruptions information
- `get_travel_advice` - Travel routes between stations
- `get_departures` - Real-time departure information
- `get_arrivals` - Real-time arrival information  
- `get_ovfiets` - OV-fiets bike availability
- `get_station_info` - Station information
- `get_prices` - Journey pricing information
- `get_current_time_in_rfc3339` - Current time in RFC3339 format

## References

- [Smithery Custom Container Documentation](https://smithery.ai/docs/build/deployments/custom-container)
- [MCP Protocol Documentation](https://modelcontextprotocol.io/)
- [NS API Documentation](https://apiportal.ns.nl/)
