import type { DetectionPartial } from '../../../shared/types';

export interface DetectorContext {
  root: string;
  platform: NodeJS.Platform;
}

export type Detector = (ctx: DetectorContext) => Promise<DetectionPartial | null>;
