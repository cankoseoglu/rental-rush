"use client";

// The area side panel: control summary, live assets & pipelines, available
// moves, furnishing choice, impact preview. Board stays quiet; this is where
// the business happens.

import { useMemo, useState } from "react";
import { useGame } from "@/lib/store";
import type { Asset, FurnishType, OpModel } from "@/lib/game/types";
import { FURNISH_SPECS, RENOVATE_COST_PER_UNIT, SWITCH_COST_HOTEL, SWITCH_COST_PER_UNIT } from "@/lib/game/types";
import {
  acquisitionCosts,
  areaById,
  areaUnits,
  isUnlicensed,
  licenceCost,
  licenceSuccessProb,
  manageCapReached,
  needsLicence,
  fullPlayerLoad,
  projectAcquisition,
  projectAssetNet,
  stayFeeFor,
  type AcquisitionSpec,
} from "@/lib/game/engine/sim";
import { cityById } from "@/lib/game/data/cities";
import { hasStaff, opsCapacity } from "@/lib/game/data/staff";
import { gbp, gbpFull } from "@/lib/game/format";
import { MODEL_META, ModelTag, StatusTag } from "./ui";
import clsx from "clsx";

type MoveKind = AcquisitionSpec["kind"];

const MOVE_META: Record<MoveKind, { emoji: string; title: string; desc: string }> = {
  rent: { emoji: "🔑", title: "Rent a unit", desc: "Arbitrage: deposit + furnishing, fixed monthly lease, you keep the spread." },
  buy: { emoji: "🏦", title: "Buy a unit", desc: "Heavy cash down, mortgage, full upside + equity that counts at the end." },
  manage: { emoji: "🤝", title: "Manage owner unit", desc: "Cheap onboarding, instant income share. Owner trust decides if it lasts." },
  building: { emoji: "🏢", title: "Lease the building", desc: "Many units, months of cash burn before live. The empire move." },
};

const riskWord = (n: number) => (n >= 70 ? "High" : n >= 45 ? "Medium" : "Low");
const demandWord = (n: number) => (n >= 3 ? "High" : n === 2 ? "Medium" : "Low");

export default function AreaPanel({
  areaId,
  interactive: interactiveProp,
}: {
  areaId: string;
  interactive: boolean;
}) {
  const game = useGame((s) => s.game)!;
  const ui = useGame((s) => s.ui);
  const act = useGame((s) => s.act);
  const area = areaById(game, areaId);
  const city = cityById(area.cityId);
  const me = game.players[0];
  const controllerId = game.control[area.id];
  const controller = controllerId !== null && controllerId !== undefined ? game.players[controllerId] : null;
  const head = game.pendingQueue[0];
  // Deals are only legal on the tile you're standing on. Derive that from the
  // engine state directly — never trust the parent's flag alone.
  const interactive =
    interactiveProp &&
    head?.kind === "area" &&
    head.areaId === areaId &&
    game.current === 0 &&
    me.pos === game.tiles.find((t) => t.areaId === areaId)?.idx &&
    !game.over;
  const backOffice =
    game.current === 0 && !ui.busy && !game.over && (!head || head.kind === "area");

  const [move, setMove] = useState<MoveKind | null>(null);
  const [model, setModel] = useState<OpModel>("STR");
  const [furnish, setFurnish] = useState<FurnishType>("fast");
  const [withLicence, setWithLicence] = useState(false);

  const buildingTakenBy =
    game.buildingTaken[area.id] !== null && game.buildingTaken[area.id] !== undefined
      ? game.players[game.buildingTaken[area.id]!]
      : null;

  const projection = useMemo(() => {
    if (!move) return null;
    const spec: AcquisitionSpec = {
      kind: move,
      model: move === "building" ? model : model === "HOTEL" ? "STR" : model,
      furnish,
      withLicence,
    };
    return projectAcquisition(game, me, area, spec);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [move, model, furnish, withLicence, game, areaId]);

  const licNeeded = move ? needsLicence(area, model, me) : false;
  const licProb = licenceSuccessProb(area, model, me);
  const stayFee = stayFeeFor(game, area.id, 0);

  const confirm = () => {
    if (!move || !projection) return;
    act({ t: "ACQUIRE", spec: projection.spec });
    setMove(null);
    setWithLicence(false);
  };

  return (
    <div className="flex flex-col gap-2.5 p-3">
      {/* header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display truncate text-xl font-extrabold leading-tight">
            {area.name}
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[0.68rem] text-cream-50/60">
            <span>
              {city.emoji} {city.name}
            </span>
            <span className="chip">{"£".repeat(area.level)}</span>
            <span className="chip" title="Area demand">
              📶 {demandWord(area.demand)}
            </span>
            <span
              className={clsx("chip", area.regRisk >= 60 ? "text-coral-400" : area.regRisk >= 45 ? "text-amber-400" : "text-cream-50/70")}
              title={`Regulation risk ${area.regRisk}/100`}
            >
              ⚖️ {riskWord(area.regRisk)}
            </span>
          </div>
        </div>
        <div
          className="shrink-0 rounded-xl border px-2.5 py-1.5 text-center"
          style={{
            borderColor: controller ? `${controller.color}88` : "rgba(125,160,210,0.25)",
            background: controller ? `${controller.color}14` : "rgba(31,48,80,0.4)",
          }}
        >
          <div className="text-[0.54rem] font-bold uppercase tracking-wider text-cream-50/50">
            Controlled by
          </div>
          <div className="text-[0.8rem] font-extrabold" style={{ color: controller?.color ?? "#8aa" }}>
            {controller ? `${controller.emoji} ${controller.name}` : "Nobody"}
          </div>
        </div>
      </div>

      {stayFee > 0 && interactive && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-[0.7rem] font-semibold text-amber-400">
          You paid {controller?.name} a {gbpFull(stayFee)} stay fee for trading on their turf.
        </div>
      )}

      {/* control summary */}
      <div className="grid grid-cols-3 gap-1.5">
        {game.players.map((p) => {
          const units = areaUnits(game, p.id, area.id);
          const liveUnits = p.assets.reduce(
            (s, a) => (a.areaId === area.id && a.status === "live" ? s + a.units : s),
            0,
          );
          return (
            <div
              key={p.id}
              className={clsx("panel px-2 py-1.5", controllerId === p.id && "border-2")}
              style={controllerId === p.id ? { borderColor: `${p.color}99` } : undefined}
            >
              <div className="flex items-center gap-1 text-[0.62rem] font-bold" style={{ color: p.color }}>
                <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                {p.name}
              </div>
              <div className="font-ledger text-sm font-extrabold">
                {units}
                <span className="text-[0.6rem] font-semibold text-cream-50/45"> unit{units === 1 ? "" : "s"}</span>
              </div>
              <div className="text-[0.56rem] text-cream-50/45">
                {units === 0 ? "no presence" : `${liveUnits} live · ${units - liveUnits} pipeline`}
              </div>
            </div>
          );
        })}
      </div>

      {/* assets here */}
      <AssetsHere areaId={area.id} backOffice={backOffice} />

      {/* moves */}
      {interactive ? (
        <>
          <div className="text-[0.62rem] font-bold uppercase tracking-wider text-cream-50/45">
            Available moves here
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {(Object.keys(MOVE_META) as MoveKind[]).map((k) => {
              const meta = MOVE_META[k];
              const spec: AcquisitionSpec = { kind: k, model: "STR", furnish: "fast", withLicence: false };
              const costs = acquisitionCosts(area, spec, me);
              const blocked =
                (k === "building" && buildingTakenBy !== null) ||
                (k === "manage" && manageCapReached(me, area.id));
              const costLine =
                k === "building"
                  ? `${gbp(costs.cashNow)} setup · ${gbp(costs.monthlyFixed)}/mo · ${costs.units} units`
                  : k === "buy"
                    ? `${gbp(area.unitPrice)} price · ${gbp(costs.cashNow)} now`
                    : k === "rent"
                      ? `${gbp(costs.cashNow)} setup · ${gbp(costs.monthlyFixed)}/mo`
                      : `${gbp(costs.cashNow)} onboarding`;
              return (
                <button
                  key={k}
                  disabled={blocked}
                  onClick={() => {
                    setMove(move === k ? null : k);
                    if (k !== "building" && model === "HOTEL") setModel("STR");
                    setWithLicence(false);
                  }}
                  className={clsx(
                    "rounded-xl border px-2.5 py-2 text-left transition",
                    move === k ? "border-lime-400/70 bg-lime-400/10" : "border-line bg-ink-800/50",
                    blocked && "opacity-40",
                  )}
                >
                  <div className="text-[0.78rem] font-bold leading-tight">
                    {meta.emoji} {meta.title}
                  </div>
                  <div className="font-ledger mt-0.5 text-[0.62rem] font-semibold text-lime-300/90">
                    {blocked
                      ? k === "building"
                        ? `Taken by ${buildingTakenBy?.name}`
                        : "Owner pool tapped (2 max)"
                      : costLine}
                  </div>
                  <div className="mt-0.5 text-[0.6rem] leading-snug text-cream-50/50">{meta.desc}</div>
                </button>
              );
            })}
          </div>

          {/* config */}
          {move && (
            <div className="space-y-2 rounded-xl border border-line bg-ink-850/80 p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[0.6rem] font-bold uppercase tracking-wider text-cream-50/45">
                  Run it as
                </span>
                {(["STR", "MTR", "LTR", "HOTEL"] as OpModel[]).map((m) => {
                  const meta = MODEL_META[m];
                  const hotelOk =
                    m !== "HOTEL" ||
                    (move === "building" && (hasStaff(me, "guestOps") || hasStaff(me, "aiOps")));
                  return (
                    <button
                      key={m}
                      disabled={!hotelOk}
                      onClick={() => setModel(m)}
                      title={meta.blurb + (m === "HOTEL" && !hotelOk ? " (building + ops staff required)" : "")}
                      className={clsx(
                        "rounded-full px-2.5 py-1 text-[0.66rem] font-extrabold transition",
                        model === m ? "text-ink-900" : "text-cream-50/70",
                        !hotelOk && "opacity-35",
                      )}
                      style={{
                        background: model === m ? meta.color : `${meta.color}1f`,
                        border: `1px solid ${meta.color}66`,
                      }}
                    >
                      {meta.emoji} {meta.label}
                    </button>
                  );
                })}
              </div>

              {move !== "manage" && (
                <div className="grid grid-cols-2 gap-1.5">
                  {(["fast", "slow"] as FurnishType[]).map((f) => {
                    const spec = FURNISH_SPECS[f];
                    const months = spec.months(move === "building" ? "building" : "unit");
                    return (
                      <button
                        key={f}
                        onClick={() => setFurnish(f)}
                        className={clsx(
                          "rounded-xl border px-2.5 py-2 text-left",
                          furnish === f ? "border-lime-400/70 bg-lime-400/8" : "border-line bg-ink-800/50",
                        )}
                      >
                        <div className="text-[0.72rem] font-bold">
                          {f === "fast" ? "⚡" : "🧱"} {spec.label}
                          <span className="font-ledger ml-1 text-[0.6rem] text-cream-50/50">{months}mo</span>
                        </div>
                        <div className="mt-0.5 text-[0.58rem] leading-snug text-cream-50/55">
                          {f === "fast"
                            ? "Cheaper, earns sooner. Lower ADR, capped reviews, more breakages."
                            : "Pricier, slower. Higher ADR & occupancy, better reviews, fewer repairs."}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {licNeeded && model !== "HOTEL" && (
                <button
                  onClick={() => setWithLicence(!withLicence)}
                  className={clsx(
                    "flex w-full items-center justify-between rounded-xl border px-2.5 py-2 text-left",
                    withLicence ? "border-violet-400/70 bg-violet-400/10" : "border-line bg-ink-800/50",
                  )}
                >
                  <span className="text-[0.7rem] font-bold">
                    ⚖️ Apply for the licence now
                    <span className="ml-1 block text-[0.58rem] font-medium text-cream-50/50">
                      {Math.round(licProb * 100)}% approval odds · 2-4 months · running unlicensed risks fines
                    </span>
                  </span>
                  <span className="font-ledger text-[0.72rem] font-bold text-violet-400">
                    {withLicence ? "✓ " : "+"}
                    {gbp(licenceCost(move === "building" ? area.buildingUnits : 1, area))}
                  </span>
                </button>
              )}
              {model === "HOTEL" && (
                <div className="rounded-xl border border-violet-400/40 bg-violet-400/8 px-2.5 py-1.5 text-[0.62rem] font-semibold text-violet-400">
                  Hotel Mode requires a licence — application ({Math.round(licProb * 100)}% odds,{" "}
                  {gbp(licenceCost(area.buildingUnits, area))}) is filed with the lease.
                </div>
              )}

              {/* impact preview */}
              {projection && (
                <>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(
                      [
                        ["Cash after", gbp(me.cash - projection.costs.cashNow - (withLicence || model === "HOTEL" ? projection.costs.licenceCost : 0)), me.cash - projection.costs.cashNow < 0 ? "text-coral-400" : "text-cream-50"],
                        ["Burn till live", projection.monthsToLive > 0 ? `−${gbp(projection.burnNow)}/mo · ${projection.monthsToLive}mo` : "none", projection.burnNow > 0 ? "text-amber-400" : "text-cream-50/60"],
                        ["When live", `${projection.liveNet >= 0 ? "+" : ""}${gbp(projection.liveNet)}/mo`, projection.liveNet >= 0 ? "text-lime-300" : "text-coral-400"],
                        ["Ops after", `${(fullPlayerLoad(me) + projection.opsAdd).toFixed(1)}/${opsCapacity(me)}`, fullPlayerLoad(me) + projection.opsAdd > opsCapacity(me) ? "text-coral-400" : "text-teal-400"],
                      ] as Array<[string, string, string]>
                    ).map(([k, v, cls]) => (
                      <div key={k} className="rounded-lg bg-ink-800/70 px-1.5 py-1.5 text-center">
                        <div className="text-[0.5rem] font-bold uppercase tracking-wide text-cream-50/40">{k}</div>
                        <div className={clsx("font-ledger mt-0.5 text-[0.66rem] font-bold leading-tight", cls)}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {projection.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {projection.flags.map((f) => (
                        <span key={f} className={clsx("chip", f === "Loss-making" || f === "Over ops capacity" ? "text-coral-400" : "text-amber-400")}>
                          ⚠️ {f}
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* CTA */}
          <div className="flex gap-1.5">
            <button onClick={() => act({ t: "CLOSE_AREA" })} className="btn-dark h-11 flex-1 text-sm">
              {move ? "Skip" : "Done here"}
            </button>
            {move && projection && (
              <button
                disabled={!projection.affordable}
                onClick={confirm}
                className="btn-primary h-11 flex-[2] text-[0.8rem]"
              >
                {projection.affordable
                  ? `${MOVE_META[move].title} · ${gbp(projection.costs.cashNow + (withLicence || model === "HOTEL" ? projection.costs.licenceCost : 0))}`
                  : `Need ${gbp(projection.costs.cashNow)}`}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className="rounded-xl bg-ink-800/50 px-3 py-2 text-center text-[0.66rem] text-cream-50/45">
          👀 Scouting only — you can only do deals on the tile you're standing on.
          Roll and land here to rent, buy, manage or lease.
        </div>
      )}
    </div>
  );
}

// --- assets in this area --------------------------------------------------------

function AssetsHere({ areaId, backOffice }: { areaId: string; backOffice: boolean }) {
  const game = useGame((s) => s.game)!;
  const act = useGame((s) => s.act);
  const me = game.players[0];
  const mine = me.assets.filter((a) => a.areaId === areaId);
  const rivals = game.players
    .slice(1)
    .map((p) => ({
      p,
      assets: p.assets.filter((a) => a.areaId === areaId),
    }))
    .filter((x) => x.assets.length > 0);

  if (mine.length === 0 && rivals.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="text-[0.62rem] font-bold uppercase tracking-wider text-cream-50/45">
        Assets in this area
      </div>
      {mine.map((a) => (
        <MyAssetRow key={a.id} asset={a} backOffice={backOffice} />
      ))}
      {rivals.map(({ p, assets }) =>
        assets.map((a) => (
          <div key={a.id} className="flex items-center justify-between rounded-lg bg-ink-800/40 px-2.5 py-1.5">
            <span className="flex items-center gap-1.5 text-[0.68rem] font-semibold" style={{ color: p.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
              {p.name} · {a.kind === "building" ? `${a.units}-unit block` : "unit"}
            </span>
            <span className="flex items-center gap-1.5">
              <ModelTag m={a.model} />
              <StatusTag status={a.status} monthsToLive={a.monthsToLive} licenceMonths={a.licenceMonths} />
            </span>
          </div>
        )),
      )}
    </div>
  );
}

function MyAssetRow({ asset: a, backOffice }: { asset: Asset; backOffice: boolean }) {
  const game = useGame((s) => s.game)!;
  const act = useGame((s) => s.act);
  const me = game.players[0];
  const area = areaById(game, a.areaId);
  const net = a.status === "live" ? projectAssetNet(game, me, a) : -a.monthlyFixed;
  const unlicensed = a.status === "live" && isUnlicensed(game, me, a);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-lime-400/25 bg-ink-800/60 px-2.5 py-2">
      <button onClick={() => setExpanded(!expanded)} className="flex w-full items-center justify-between gap-2 text-left">
        <span className="min-w-0">
          <span className="block truncate text-[0.74rem] font-bold">
            {a.kind === "building" ? `${a.units}-unit block` : "Your unit"}
            <span className="ml-1.5 text-[0.6rem] font-semibold text-cream-50/45">{a.deal}</span>
            {unlicensed && <span className="ml-1.5 text-[0.6rem] font-bold text-coral-400">⚠ unlicensed</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5">
            <ModelTag m={a.model} />
            <StatusTag status={a.status} monthsToLive={a.monthsToLive} licenceMonths={a.licenceMonths} />
            {a.licence === "rejected" && (
              <span className="text-[0.58rem] font-bold text-coral-400">licence rejected</span>
            )}
            {a.status === "live" && <span className="text-[0.6rem] text-cream-50/50">★ {a.rating.toFixed(1)}</span>}
          </span>
        </span>
        <span className={clsx("font-ledger shrink-0 text-[0.78rem] font-bold", net >= 0 ? "text-lime-300" : "text-coral-400")}>
          {net >= 0 ? "+" : ""}
          {gbp(net)}/mo
        </span>
      </button>

      {expanded && backOffice && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-line/60 pt-2">
          {(["STR", "MTR", "LTR", "HOTEL"] as OpModel[]).map((m) => {
            const blocked =
              m === a.model ||
              (m === "HOTEL" &&
                (a.kind !== "building" || a.licence !== "approved" || !(hasStaff(me, "guestOps") || hasStaff(me, "aiOps"))));
            const cost = (m === "HOTEL" ? SWITCH_COST_HOTEL : SWITCH_COST_PER_UNIT) * a.units;
            return (
              <button
                key={m}
                disabled={blocked}
                onClick={() => act({ t: "SWITCH_MODEL", assetId: a.id, model: m })}
                title={`Switch to ${m} (${gbp(cost)})`}
                className={clsx(
                  "rounded-full px-2 py-0.5 text-[0.6rem] font-extrabold",
                  m === a.model ? "bg-ink-600 text-cream-50" : "bg-ink-900 text-cream-50/55 hover:text-cream-50",
                  blocked && m !== a.model && "opacity-30",
                )}
              >
                {m}
              </button>
            );
          })}
          {(a.licence === "none" || a.licence === "rejected") &&
            (a.model === "HOTEL" || needsLicence(area, a.model, me)) && (
              <button onClick={() => act({ t: "APPLY_LICENCE", assetId: a.id })} className="chip text-violet-400">
                ⚖️ {a.licence === "rejected" ? "Reapply" : "Licence"} ·{" "}
                {gbp(Math.round(licenceCost(a.units, area) * (a.licence === "rejected" ? 0.6 : 1)))}
              </button>
            )}
          {a.status === "live" && a.furnishQ < 1.15 && (
            <button
              onClick={() => act({ t: "RENOVATE", assetId: a.id })}
              disabled={me.cash < RENOVATE_COST_PER_UNIT * a.units}
              className="chip text-amber-400"
              title="+ADR, +rating, fewer breakages"
            >
              🛠️ Renovate · {gbp(RENOVATE_COST_PER_UNIT * a.units)}
            </button>
          )}
          <button
            onClick={() => act({ t: "SELL_ASSET", assetId: a.id })}
            className="chip text-coral-400"
            title={a.deal === "buy" ? "Sell at 95% of value" : a.deal === "lease" ? "Exit lease (1 month penalty)" : "Hand back to owner"}
          >
            {a.deal === "buy"
              ? `Sell +${gbp(Math.round(a.value * 0.95) - a.mortgage)}`
              : a.deal === "lease"
                ? `Exit −${gbp(a.monthlyFixed)}`
                : "Hand back"}
          </button>
          <button
            onClick={() => act({ t: "AUCTION_MY_ASSET", assetId: a.id })}
            className="chip text-violet-400"
            title="Rivals bid over 3 rounds; you keep the proceeds. No bids = you keep the asset."
          >
            🔨 Auction it
          </button>
        </div>
      )}
    </div>
  );
}
