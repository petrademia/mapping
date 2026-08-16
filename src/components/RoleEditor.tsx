import { useState } from "react";
import { addRole, removeRole } from "../lib/roles";

interface Props {
  roles: string[];
  vocabulary: string[];
  onChange: (roles: string[]) => void;
  onAddVocabulary: (role: string) => void;
}

export function RoleEditor({ roles, vocabulary, onChange, onAddVocabulary }: Props) {
  const [draft, setDraft] = useState("");
  const assigned = new Set(roles);
  const unused = vocabulary.filter((role) => !assigned.has(role));

  function submitDraft(): void {
    const role = draft.trim();
    if (!role) return;
    onAddVocabulary(role);
    onChange(addRole(roles, role));
    setDraft("");
  }

  return (
    <div className="roles">
      {roles.map((role) => (
        <button
          key={role}
          type="button"
          className="chip on"
          data-role={role}
          onClick={() => onChange(removeRole(roles, role))}
        >
          {role}
          <span aria-hidden="true">×</span>
        </button>
      ))}
      {unused.length > 0 ? (
        <select
          aria-label="Add role"
          value=""
          onChange={(event) => {
            const role = event.target.value;
            if (role) onChange(addRole(roles, role));
          }}
        >
          <option value="">add role</option>
          {unused.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </select>
      ) : null}
      <input
        className="role-draft"
        value={draft}
        placeholder="custom role"
        aria-label="Add custom role"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitDraft();
          }
        }}
      />
    </div>
  );
}
