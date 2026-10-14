// Extension contract. No image/video generation requests are made in the pilot.
export type MediaRequest = {
  kind: "image" | "video";
  prompt: string;
  referenceAssetIds: string[];
};
export interface MediaGenerationProvider {
  capabilities(): { image: boolean; video: boolean };
  submit(request: MediaRequest): Promise<{ providerJobId: string }>;
  status(
    providerJobId: string,
  ): Promise<{
    status: "pending" | "running" | "succeeded" | "failed";
    resultUrl?: string;
  }>;
}
export const mediaGeneration = {
  configured: false,
  image: false,
  video: false,
} as const;
