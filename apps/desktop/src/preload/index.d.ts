import type { LumiApi } from "@lumi/shared";

declare global {
  interface Window {
    lumi: LumiApi;
  }
}

export {};
