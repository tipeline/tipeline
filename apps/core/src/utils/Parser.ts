import yaml, { YAMLException } from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { YAMLParsingError } from '@utils/errors';

export class Parser {
  static importFromFile(filePath: string): unknown {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return yaml.load(content, { schema: yaml.JSON_SCHEMA });
    } catch (e) {
      if (e instanceof YAMLException) {
        throw new YAMLParsingError(`Invalid YAML: ${e.message}`);
      } else if (e instanceof Error) {
        throw new YAMLParsingError(`File Reading Error: ${e.message}`);
      } else {
        throw new YAMLParsingError('Unknown error occurred while importing the file');
      }
    }
  }

  static exportToFile(filePath: string, data: unknown): void {
    try {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });

      const yamlStr = yaml.dump(data, { noRefs: true, lineWidth: 120 });

      fs.writeFileSync(filePath, yamlStr, 'utf8');
    } catch (e) {
      if (e instanceof YAMLException) {
        throw new YAMLParsingError('Failed to serialize data to YAML');
      } else if (e instanceof Error) {
        throw new YAMLParsingError(`File Writing Error: ${e.message}`);
      } else {
        throw new YAMLParsingError('Unknown error occurred while exporting the file');
      }
    }
  }

  static importFromString(content: string): unknown {
    try {
      return yaml.load(content, { schema: yaml.JSON_SCHEMA });
    } catch (e) {
      if (e instanceof YAMLException) {
        throw new YAMLParsingError(`Invalid YAML: ${e.message}`);
      }
      throw e;
    }
  }

  static exportToString(data: unknown): string {
    try {
      return yaml.dump(data, { noRefs: true, lineWidth: 120 });
    } catch (e) {
      if (e instanceof YAMLException) {
        throw new YAMLParsingError('Failed to serialize data to YAML');
      }
      throw e;
    }
  }
}
