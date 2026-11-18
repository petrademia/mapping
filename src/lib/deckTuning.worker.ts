import { tuneDeck, type TuningRequest, type TuningResult } from "./deckTuning";

self.onmessage = ({ data }: MessageEvent<TuningRequest>) => {
  const result: TuningResult = tuneDeck(data);
  self.postMessage(result);
};
