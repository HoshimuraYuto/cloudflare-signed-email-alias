import { deploy } from "./deployment.mts";
import { readSettings } from "./settings.mts";

await deploy(readSettings(process.env, "deploy"));
