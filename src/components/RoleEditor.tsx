import { ROLES, toggleRole, type Role } from "../lib/taxonomy";

const LABELS: Record<Role, string> = {
  starter: "Starter",
  extender: "Extender",
  interaction: "Interaction",
};

interface Props {
  roles: Role[];
  onChange: (roles: Role[]) => void;
}

export function RoleEditor({ roles, onChange }: Props) {
  const assigned = new Set(roles);
  return (
    <div className="taxonomy-block">
      <span className="taxonomy-label">Role</span>
      <div className="roles" role="group" aria-label="Roles">
        {ROLES.map((role) => {
          const on = assigned.has(role);
          return (
            <button
              key={role}
              type="button"
              className={on ? "chip on" : "chip"}
              data-role={role}
              aria-pressed={on}
              onClick={() => onChange(toggleRole(roles, role))}
            >
              {LABELS[role]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
