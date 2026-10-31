export type HistoricalPinpoint = {
  id: string;
  latitude: number;
  longitude: number;
  sequenceNumber: number;
  status: "OFFEN" | "ERREICHT" | "ERLEDIGT";
  date: string;
  season: number;
  orderLabel: string;
  fieldLabel: string;
  rehkitzeGesichert: number;
  rehkitzeAbgesprungen: number;
  sonstigesWildGesichert: number;
  sonstigesWildAbgesprungen: number;
  maulwurfhuegelFehlstelle: number;
};

export type HistoricalPinpointsResponse = {
  items: HistoricalPinpoint[];
  seasons: number[];
  currentSeason: number;
  truncated: boolean;
  error?: string;
};
