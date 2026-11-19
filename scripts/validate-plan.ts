#!/usr/bin/env tsx
/**
 * Floor-plan validation CLI.
 *
 * Runs the exact same pipeline the web app uses (lib/geometry) against a JSON
 * file or a built-in preset, and exits non-zero when the polygon is rejected.
 * Handy for CI, for pre-flighting a survey export, or for reproducing a bug
 * from the browser in a terminal.
 *
 *   npx tsx scripts/validate-plan.ts --preset courtyard-villa
 *   npx tsx scripts/validate-plan.ts --list
 *   npx tsx scripts/validate-plan.ts plan.json --units mm --wall-height 2.9
 *
 * Plan JSON shape:
 *   { "units": "m", "outer": [[0,0],[6,0],[6,4],[0,4]], "holes": [[[1,1],...]] }
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeFloorPlan } from "../lib/geometry/index";
import { PLAN_PRESETS } from "../lib/geometry/fixtures";
import type { AnalyzeOptions, LengthUnit, RawFloorPlan } from "../lib/geometry/types";

interface CliArgs {
  file?: string;
  preset?: string;
  units?: LengthUnit;
  wallHeight?: number;
  json: boolean;
  list: boolean;
}

const UNITS: LengthUnit[] = ["m", "cm", "mm", "ft"];

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { json: false, list: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    switch (token) {
      case "--json":
        args.json = true;
        break;
      case "--list":
        args.list = true;
        break;
      case "--preset":
        args.preset = argv[++i];
        break;
      case "--units": {
        const value = argv[++i] as LengthUnit;
        if (!UNITS.includes(value)) fail(`--units must be one of ${UNITS.join(", ")}`);
        args.units = value;
        break;
      }
      case "--wall-height": {
        const value = Number(argv[++i]);
        if (!Number.isFinite(value) || value <= 0) fail("--wall-height must be a positive number");
        args.wallHeight = value;
        break;
      }
      case "--help":
      case "-h":
        usage();
        process.exit(0);
      default:
        if (token.startsWith("-")) fail(`unknown flag: ${token}`);
        if (args.file) fail("only one plan file may be supplied");
        args.file = token;
    }
  }
  return args;
}

function usage(): void {
  console.log(`floor-plan validator

usage:
  tsx scripts/validate-plan.ts --preset <id> [--units m|cm|mm|ft] [--wall-height 2.8] [--json]
  tsx scripts/validate-plan.ts <plan.json>  [--units m|cm|mm|ft] [--wall-height 2.8] [--json]
  tsx scripts/validate-plan.ts --list

exit codes:
  0  polygon validated
  1  polygon rejected (or bad arguments)
`);
}

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function loadPlan(args: CliArgs): { plan: RawFloorPlan; units: LengthUnit; label: string } {
  if (args.preset) {
    const preset = PLAN_PRESETS.find((item) => item.id === args.preset);
    if (!preset) fail(`unknown preset "${args.preset}" — run with --list to see ids`);
    return { plan: preset.plan, units: args.units ?? preset.units, label: `preset:${preset.id}` };
  }

  if (!args.file) fail("no input — pass a plan.json or --preset <id>");

  const path = resolve(process.cwd(), args.file);
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (error) {
    fail(`cannot read ${path}: ${(error as Error).message}`);
  }

  const outer = raw.outer as RawFloorPlan["outer"] | undefined;
  if (!Array.isArray(outer)) fail(`${path} has no "outer" array`);

  return {
    plan: {
      outer,
      holes: Array.isArray(raw.holes) ? (raw.holes as RawFloorPlan["holes"]) : [],
    },
    units: args.units ?? (typeof raw.units === "string" && UNITS.includes(raw.units as LengthUnit) ? (raw.units as LengthUnit) : "m"),
    label: path,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.list) {
    for (const preset of PLAN_PRESETS) {
      console.log(`${preset.id.padEnd(22)} ${preset.name}  (${preset.units})`);
      console.log(`${" ".repeat(23)}${preset.description}`);
    }
    return;
  }

  const { plan, units, label } = loadPlan(args);
  const options: AnalyzeOptions = { units, wallHeight: args.wallHeight ?? 2.8 };
  const result = analyzeFloorPlan(plan, options);

  if (args.json) {
    console.log(
      JSON.stringify(
        result.ok
          ? { ok: true, label, metrics: result.plan.metrics, warnings: result.warnings, source: result.plan.geometrySource }
          : { ok: false, label, error: result.error, warnings: result.warnings },
        null,
        2,
      ),
    );
    process.exit(result.ok ? 0 : 1);
  }

  console.log(`plan      ${label}`);
  console.log(`units     ${units}   wall height ${options.wallHeight} m`);
  console.log("");

  if (!result.ok) {
    console.error(`REJECTED  ${result.error.code}`);
    console.error(`  ${result.error.message}`);
    if (result.error.hint) console.error(`  hint: ${result.error.hint}`);
    if (result.warnings.length > 0) {
      console.error("");
      for (const warning of result.warnings) console.error(`  warn ${warning.code}: ${warning.message}`);
    }
    process.exit(1);
  }

  const m = result.plan.metrics;
  const rows: Array<[string, string]> = [
    ["floor area", `${m.floorArea.toFixed(2)} m²`],
    ["outer area", `${m.outerArea.toFixed(2)} m²`],
    ["holes area", `${m.holesArea.toFixed(2)} m²`],
    ["outer perimeter", `${m.outerPerimeter.toFixed(2)} m`],
    ["hole perimeter", `${m.holesPerimeter.toFixed(2)} m`],
    ["wall area", `${m.wallArea.toFixed(2)} m²`],
    ["tiles (600×600, +10%)", `${m.quantities.tiles}`],
    ["paint (2 coats)", `${m.quantities.paintLitres} L`],
  ];
  const width = Math.max(...rows.map(([key]) => key.length));
  for (const [key, value] of rows) console.log(`${key.padEnd(width)}  ${value}`);

  console.log("");
  console.log(
    `OK  ${result.plan.triangulation.triangleCount} triangles · ${result.plan.holes.length} hole(s) · source=${result.plan.geometrySource} · deviation=${(
      result.plan.triangulation.deviation * 100
    ).toFixed(3)}%`,
  );

  if (result.warnings.length > 0) {
    console.log("");
    for (const warning of result.warnings) console.log(`  warn ${warning.code}: ${warning.message}`);
  }
}

main();
