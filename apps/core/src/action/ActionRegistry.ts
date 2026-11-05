import { GroupMath } from '@/action/actions/math/actions';
import { GroupAI } from '@/action/actions/ai/actions';
import { GroupApi } from '@/action/actions/api/actions';
import { GroupApproval } from '@/action/actions/approval/actions';
import { GroupArray } from '@/action/actions/array/actions';
import { GroupString } from '@/action/actions/string/actions';
import { GroupFolder } from '@/action/actions/folder/actions';
import { GroupFlow } from '@/action/actions/flow/actions';
import { GroupSSH } from '@/action/actions/ssh/actions';
import { GroupBrowser } from '@/action/actions/browser/actions';
import { GroupHTML } from '@/action/actions/html/actions';
import { GroupHTTP } from '@/action/actions/http/actions';
import { GroupFile } from '@/action/actions/file/actions';
import { GroupObject } from '@/action/actions/object/actions';
import { GroupOCR } from '@/action/actions/ocr/actions';
import { GroupSystem } from '@/action/actions/system/actions';
import { GroupCompression } from '@/action/actions/compression/actions';
import { GroupScript } from '@/action/actions/script/actions';
import { GroupNetwork } from '@/action/actions/network/actions';
import { GroupCryptography } from '@/action/actions/cryptography/actions';
import { GroupDateTime } from '@/action/actions/datetime/actions';
import { GroupPDF } from '@/action/actions/pdf/actions';
import { GroupDatabase } from '@/action/actions/database/actions';
import { GroupSpreadsheet } from '@/action/actions/spreadsheet/actions';
import { GroupSubtask } from '@/action/actions/subtask/actions';
import { GroupQRCode } from '@/action/actions/qrcode/actions';
import { GroupImage } from '@/action/actions/image/actions';
import { GroupVideo } from '@/action/actions/video/actions';
import { GroupAudio } from '@/action/actions/audio/actions';
import { GroupEmail } from '@/action/actions/email/actions';
import { GroupVariable } from '@/action/actions/variable/actions';
import { GroupXML } from '@/action/actions/xml/actions';
import type { ActionHandler } from '@action/Action';

export const ActionRegistry: Record<string, Record<string, ActionHandler>> = {
  math: GroupMath as unknown as Record<string, ActionHandler>,
  ai: GroupAI as unknown as Record<string, ActionHandler>,
  api: GroupApi as unknown as Record<string, ActionHandler>,
  approval: GroupApproval as unknown as Record<string, ActionHandler>,
  array: GroupArray as unknown as Record<string, ActionHandler>,
  string: GroupString as unknown as Record<string, ActionHandler>,
  folder: GroupFolder as unknown as Record<string, ActionHandler>,
  ssh: GroupSSH as unknown as Record<string, ActionHandler>,
  browser: GroupBrowser as unknown as Record<string, ActionHandler>,
  html: GroupHTML as unknown as Record<string, ActionHandler>,
  http: GroupHTTP as unknown as Record<string, ActionHandler>,
  file: GroupFile as unknown as Record<string, ActionHandler>,
  object: GroupObject as unknown as Record<string, ActionHandler>,
  ocr: GroupOCR as unknown as Record<string, ActionHandler>,
  system: GroupSystem as unknown as Record<string, ActionHandler>,
  compression: GroupCompression as unknown as Record<string, ActionHandler>,
  script: GroupScript as unknown as Record<string, ActionHandler>,
  network: GroupNetwork as unknown as Record<string, ActionHandler>,
  cryptography: GroupCryptography as unknown as Record<string, ActionHandler>,
  datetime: GroupDateTime as unknown as Record<string, ActionHandler>,
  pdf: GroupPDF as unknown as Record<string, ActionHandler>,
  database: GroupDatabase as unknown as Record<string, ActionHandler>,
  spreadsheet: GroupSpreadsheet as unknown as Record<string, ActionHandler>,
  subtask: GroupSubtask as unknown as Record<string, ActionHandler>,
  qrcode: GroupQRCode as unknown as Record<string, ActionHandler>,
  image: GroupImage as unknown as Record<string, ActionHandler>,
  video: GroupVideo as unknown as Record<string, ActionHandler>,
  audio: GroupAudio as unknown as Record<string, ActionHandler>,
  email: GroupEmail as unknown as Record<string, ActionHandler>,
  variable: GroupVariable as unknown as Record<string, ActionHandler>,
  flow: GroupFlow as unknown as Record<string, ActionHandler>,
  xml: GroupXML as unknown as Record<string, ActionHandler>,
};
