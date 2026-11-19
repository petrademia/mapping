import { ROLE_LABELS } from "../lib/roleLabels";
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
  unclassified: "not set",
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
        <h2>Card tags</h2>
        <p>Main deck {deck}</p>
      </header>
      <p className="note">
        What the cards are tagged as, not what a hand can do.
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
        Roles overlap, so the slots can add up to more than the deck: {roleSlotSum} slots in {deck}{" "}
        cards. They are your hypotheses, not facts about the cards.
      </p>
      <div className="density">
        {ROLES.map((role) => {
          const slots = density[role];
          return (
            <div key={role} className="density-row" data-role={role}>
              <span className="swatch" aria-hidden="true" />
              <span className="role-label">{ROLE_LABELS[role]}</span>
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
        One quality per card, per turn order. With Not set, the counts add up to the deck (going
        first {qualitySlotSumGF} / {deck}, going second {qualitySlotSumGS} / {deck}).
      </p>
      <p className="panel-subhead">Going First</p>
      <div className="density">
        {QUALITY_ORDER.map((key) => {
          const slots = qualitiesGF[key];
          return (
            <div key={key} className="density-row" data-quality={key}>
              <span className="swatch" aria-hidden="true" />
              <span className="role-label">{QUALITY_LABELS[key]}</span>
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
              <span className="role-label">{QUALITY_LABELS[key]}</span>
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
