import type { RDModel } from "./types";
import { grayScott } from "./grayScott";

export type { RDModel, AxisDef } from "./types";

/** 利用可能なモデルの registry。新モデルはここに足す。 */
export const models: RDModel[] = [grayScott];

export function findModel(id: string | null): RDModel {
  return models.find((m) => m.id === id) ?? models[0];
}
