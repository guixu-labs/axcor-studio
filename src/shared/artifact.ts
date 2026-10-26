import type { Artifact } from './protocol';

export const artifactLabel = (artifact: Artifact): string => `${artifact.type}: ${artifact.name}`;
