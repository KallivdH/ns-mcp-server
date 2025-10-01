import axios, { AxiosInstance } from 'axios';
import { 
  Disruption, 
  GetDisruptionsArgs, 
  TravelAdvice, 
  GetTravelAdviceArgs,
  DeparturesResponse,
  GetDeparturesArgs,
  OVFietsResponse,
  GetOVFietsArgs,
  StationInfoArgs,
  StationInfoResponse,
  ArrivalsResponse,
  GetArrivalsArgs,
  PricesResponse,
  GetPricesArgs
} from '../types.js';

export class NSApiService {
  private axiosInstance: AxiosInstance;
  private apiKey: string;
  private static readonly BASE_URL = 'https://gateway.apiportal.ns.nl';
  private static readonly ENDPOINTS = {
    DISRUPTIONS: '/disruptions/v3',
    TRIPS: '/reisinformatie-api/api/v3/trips',
    DEPARTURES: '/reisinformatie-api/api/v2/departures',
    ARRIVALS: '/reisinformatie-api/api/v2/arrivals',
    PRICES: '/reisinformatie-api/api/v3/price',
    OVFIETS: '/places-api/v2/ovfiets',
    STATIONS: '/nsapp-stations/v3'
  } as const;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.axiosInstance = axios.create({
      baseURL: NSApiService.BASE_URL,
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
      },
    });
  }

  private ensureApiKeyConfigured(): void {
    if (!this.apiKey) {
      throw new Error('NS_API_KEY is not configured. Please provide your NS API key in the server configuration.');
    }
  }

  async getDisruptions(args: GetDisruptionsArgs): Promise<Disruption[]> {
    this.ensureApiKeyConfigured();
    const response = await this.axiosInstance.get<Disruption[]>(
      NSApiService.ENDPOINTS.DISRUPTIONS,
      {
        params: {
          isActive: args.isActive,
          type: args.type,
        },
      }
    );
    return response.data;
  }

  async getTravelAdvice(args: GetTravelAdviceArgs): Promise<TravelAdvice[]> {
    this.ensureApiKeyConfigured();
    const response = await this.axiosInstance.get<TravelAdvice[]>(
      NSApiService.ENDPOINTS.TRIPS,
      {
        params: {
          fromStation: args.fromStation,
          toStation: args.toStation,
          dateTime: args.dateTime,
          searchForArrival: args.searchForArrival,
        },
      }
    );
    return response.data;
  }

  async getDepartures(args: GetDeparturesArgs): Promise<DeparturesResponse> {
    this.ensureApiKeyConfigured();
    const response = await this.axiosInstance.get<DeparturesResponse>(
      NSApiService.ENDPOINTS.DEPARTURES,
      {
        params: {
          station: args.station,
          dateTime: args.dateTime,
          maxJourneys: args.maxJourneys,
          lang: args.lang
        },
      }
    );
    return response.data;
  }

  async getOVFiets(args: GetOVFietsArgs): Promise<OVFietsResponse> {
    this.ensureApiKeyConfigured();
    const response = await this.axiosInstance.get<OVFietsResponse>(
      NSApiService.ENDPOINTS.OVFIETS,
      {
        params: {
          station_code: args.stationCode
        }
      }
    );
    return response.data;
  }

  async getStationInfo(args: StationInfoArgs): Promise<StationInfoResponse> {
    this.ensureApiKeyConfigured();
    const response = await this.axiosInstance.get<StationInfoResponse>(
      NSApiService.ENDPOINTS.STATIONS,
      {
        params: {
          q: args.query,
          includeNonPlannableStations: args.includeNonPlannableStations ?? false,
          limit: args.limit ?? 10
        }
      }
    );
    return response.data;
  }

  async getArrivals(args: GetArrivalsArgs): Promise<ArrivalsResponse> {
    this.ensureApiKeyConfigured();
    const response = await this.axiosInstance.get<ArrivalsResponse>(
      NSApiService.ENDPOINTS.ARRIVALS,
      {
        params: {
          station: args.station,
          uicCode: args.uicCode,
          dateTime: args.dateTime,
          maxJourneys: args.maxJourneys,
          lang: args.lang
        },
      }
    );
    return response.data;
  }

  async getPrices(args: GetPricesArgs): Promise<PricesResponse> {
    this.ensureApiKeyConfigured();
    const response = await this.axiosInstance.get<PricesResponse>(
      NSApiService.ENDPOINTS.PRICES,
      {
        params: {
          fromStation: args.fromStation,
          toStation: args.toStation,
          travelClass: args.travelClass,
          travelType: args.travelType,
          isJointJourney: args.isJointJourney,
          adults: args.adults,
          children: args.children,
          routeId: args.routeId,
          plannedDepartureTime: args.plannedDepartureTime,
          plannedArrivalTime: args.plannedArrivalTime
        },
      }
    );
    return response.data;
  }
} 