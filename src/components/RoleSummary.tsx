import { sectionSize } from "../lib/document";
import type { MappingDocument } from "../lib/document";
import {
  openingQualityDensity,
  ROLES,
  roleDensity,
  type OpeningQualityBucket,
} from "../lib/taxonomy";

function percent(slots: number, deck: number): number {
  if (deck <= 0) return 0;
  return Math.min(100, (slots / deck) * 100);
}

const QUALITY_ORDER: OpeningQualityBucket[] = [
  "desirable",
  "neutral",
  "undesirable",
  "unclassified",
];

const QUALITY_LABELS: Record<OpeningQualityBucket, string> = {
  desirable: "desirable",
  neutral: "neutral",
  undesirable: "undesirable",
  unclassified: "unclassified",
};

interface Props {
  doc: MappingDocument;
}

export function RoleSummary({ doc }: Props) {
  const deck = sectionSize(doc.main);
  const density = roleDensity(doc.main);
  const qualitiesGF = openingQualityDensity(doc.main, "going_first");
  const qualitiesGS = openingQualityDensity(doc.main, "going_second");
  const roleSlotSum = ROLES.reduce((sum, role) => sum + density[role], 0);
  const qualitySlotSumGF = QUALITY_ORDER.reduce(
    (sum, key) => sum + qualitiesGF[key],
    0,
  );
  const qualitySlotSumGS = QUALITY_ORDER.reduce(
    (sum, key) => sum + qualitiesGS[key],
    0,
  );

  return (
    <section className="panel">
      <header>
        <h2>Taxonomy / Annotation Analysis</h2>
        <p>Main deck {deck}</p>
      </header>
      <p className="note">
        Raw card annotations. These describe what cards are tagged as, not what
        the modeled hand can do - role and quality stats here are diagnostics,
        not strategic usability.
      </p>
      <ul className="census">
        <li>
          <span>Main</span>
          <strong>{deck}</strong>
        </li>
        <li>
          <span>Extra</span>
          <strong>{sectionSize(doc.extra)}</strong>
        </li>
        <li>
          <span>Side</span>
          <strong>{sectionSize(doc.side)}</strong>
        </li>
      </ul>
      <h3 className="panel-subhead">Role slots</h3>
      <p className="note">
        Main-deck composition only. Roles overlap, so slot counts need not sum
        to deck size. Current role slot sum is {roleSlotSum} against {deck}{" "}
        main-deck cards. These are human hypotheses for this deck, not objective
        card properties.
      </p>
      <div className="density">
        {ROLES.map((role) => {
          const slots = density[role];
          return (
            <div key={role} className="density-row" data-role={role}>
              <span className="swatch" aria-hidden="true" />
              <span className="role-label">{role} slots</span>
              <div className="track">
                <div className="fill" style={{ width: `${percent(slots, deck)}%` }} />
              </div>
              <span className="frac">
                {slots} / {deck}
              </span>
            </div>
          );
        })}
      </div>
      <h3 className="panel-subhead">Opening quality slots</h3>
      <p className="note">
        Mutually exclusive per card entry, evaluated per turn order. Counts
        should sum to main deck size when including unclassified (GF{" "}
        {qualitySlotSumGF} / {deck}; GS {qualitySlotSumGS} / {deck}).
      </p>
      <p className="panel-subhead">Going First</p>
      <div className="density">
        {QUALITY_ORDER.map((key) => {
          const slots = qualitiesGF[key];
          return (
            <div key={key} className="density-row" data-quality={key}>
              <span className="swatch" aria-hidden="true" />
              <span className="role-label">{QUALITY_LABELS[key]} slots</span>
              <div className="track">
                <div className="fill" style={{ width: `${percent(slots, deck)}%` }} />
              </div>
              <span className="frac">
                {slots} / {deck}
              </span>
            </div>
          );
        })}
      </div>
      <p className="panel-subhead">Going Second</p>
      <div className="density">
        {QUALITY_ORDER.map((key) => {
          const slots = qualitiesGS[key];
          return (
            <div key={key} className="density-row" data-quality={key}>
              <span className="swatch" aria-hidden="true" />
              <span className="role-label">{QUALITY_LABELS[key]} slots</span>
              <div className="track">
                <div className="fill" style={{ width: `${percent(slots, deck)}%` }} />
              </div>
              <span className="frac">
                {slots} / {deck}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
