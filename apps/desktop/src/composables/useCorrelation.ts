import { generateIdentifier } from '@tipeline/utils';

export function useCorrelation(): string {
  return generateIdentifier();
}
