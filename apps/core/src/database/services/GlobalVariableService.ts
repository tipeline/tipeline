import { GlobalVariable as GlobalVariableModel } from '@/database/models/GlobalVariable';
import { generateIdentifier } from '@tipeline/utils';
import { seal, unseal } from '@utils/secretBox';

export class GlobalVariableService {
  static async create(variableData: any) {
    const data = {
      ...variableData,
      identifier: generateIdentifier(),
      value: GlobalVariableService.stored(variableData.value, variableData.secret),
    };

    const result = await GlobalVariableModel.query().insert(data);

    return GlobalVariableService.deserialize(result);
  }

  static async update(variableData: any) {
    const { identifier, ...data } = variableData;

    const current = await GlobalVariableService.getByIdentifier(identifier);
    const secret = data.secret ?? current?.secret;
    if (data.value !== undefined) {
      data.value = GlobalVariableService.stored(data.value, secret);
    } else if (current && data.secret !== undefined && !!data.secret !== !!current.secret) {
      // Turning `secret` on or off keeps the value, stored the new way.
      data.value = GlobalVariableService.stored(current.value, secret);
    }

    await GlobalVariableModel.query().findOne({ identifier }).patch(data);

    const updatedVariable = await GlobalVariableModel.query().findOne({ identifier });

    return updatedVariable ? GlobalVariableService.deserialize(updatedVariable) : null;
  }

  static async getAll() {
    const records = await GlobalVariableModel.query().select('identifier', 'name', 'description', 'type', 'value', 'secret', 'readonly');
    return records.map(GlobalVariableService.deserialize);
  }

  static async getByName(name: string) {
    const record = await GlobalVariableModel.query().findOne({ name });
    return record ? GlobalVariableService.deserialize(record) : null;
  }

  static async getByIdentifier(identifier: string) {
    const record = await GlobalVariableModel.query().findOne({ identifier });
    return record ? GlobalVariableService.deserialize(record) : null;
  }

  static async delete(identifier: string) {
    return await GlobalVariableModel.query().delete().where({ identifier });
  }

  private static stored(value: unknown, secret: unknown) {
    const json = JSON.stringify(value);
    return secret && json !== undefined ? seal(json) : json;
  }

  private static deserialize(record: any) {
    if (!record) return record;
    try {
      return { ...record, value: record.value != null ? JSON.parse(unseal(record.value)) : null };
    } catch {
      return record;
    }
  }
}
