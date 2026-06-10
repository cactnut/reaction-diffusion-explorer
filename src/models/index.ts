import type { RDModel } from "./types";
import { grayScott } from "./grayScott";
import { schnakenberg } from "./schnakenberg";
import { brusselator } from "./brusselator";
import { giererMeinhardt } from "./giererMeinhardt";
import { thomas } from "./thomas";
import { lengyelEpstein } from "./lengyelEpstein";
import { bvam } from "./bvam";
import { fitzhughNagumo } from "./fitzhughNagumo";
import { barkley } from "./barkley";
import { oregonator } from "./oregonator";
import { mimuraMurray } from "./mimuraMurray";
import { cgl } from "./cgl";
import { kellerSegel } from "./kellerSegel";

export type { RDModel, ParamDef } from "./types";
export { getParam } from "./types";

/** 利用可能なモデルの registry。新モデルはここに足す。 */
export const models: RDModel[] = [
  grayScott,
  schnakenberg,
  brusselator,
  giererMeinhardt,
  thomas,
  lengyelEpstein,
  bvam,
  fitzhughNagumo,
  barkley,
  oregonator,
  mimuraMurray,
  cgl,
  kellerSegel,
];

export function findModel(id: string | null): RDModel {
  return models.find((m) => m.id === id) ?? models[0];
}
