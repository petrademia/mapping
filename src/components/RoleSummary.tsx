import { sectionSize } from "../lib/document";
import type { MappingDocument } from "../lib/document";
import { DEFAULT_ROLES, roleDensity } from "../lib/roles";

function percent(slots: number, deck: number): number {
  if (deck <= 0) return 0;
  return Math.min(100, (slots / deck) * 100);
}

interface Props {
  doc: MappingDocument;
}

export function RoleSummary({ doc }: Props) {
  const deck = sectionSize(doc.main);
  const density = roleDensity(doc.main);
  const roles = doc.vocabulary.filter(
    (role) =>
      (density[role] ?? 0) > 0 || (DEFAULT_ROLES as readonly string[]).includes(role),
  );
  const extra = Object.keys(density).filter((role) => !roles.includes(role));
  const listed = [...roles, ...extra];
  const slotSum = Object.values(density).reduce((sum, value) => sum + value, 0);

  return (
    <section className="panel">
      <header>
        <h2>Role density</h2>
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
      <p className="note">
        Main-deck composition only. Extra and side roles are stored but are not
        part of opening-hand density. Overlapping roles mean these slot counts
        are not a partition of deck size. Current slot sum is {slotSum} against{" "}
        {deck} main-deck cards.
      </p>
      <div className="density">
        {listed.map((role) => {
          const slots = density[role] ?? 0;
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
    </section>
  );
}
