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
  const qualities = openingQualityDensity(doc.main);
  const roleSlotSum = ROLES.reduce((sum, role) => sum + density[role], 0);
  const qualitySlotSum = QUALITY_ORDER.reduce(
    (sum, key) => sum + qualities[key],
    0,
  );

  return (
    <section className="panel">
      <header>
        <h2>Taxonomy density</h2>
        <p>Main deck {deck}</p>
      </header>
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
        Mutually exclusive per card entry. Counts should sum to main deck size
        when including unclassified ({qualitySlotSum} / {deck}).
      </p>
      <div className="density">
        {QUALITY_ORDER.map((key) => {
          const slots = qualities[key];
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
