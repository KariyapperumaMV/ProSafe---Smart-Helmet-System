import { HelmetCard } from "./HelmetCard";

export function HelmetList({ helmets, onView, onDelete }) {
  return (
    <div className="ps-user-list">
      {helmets.map((helmet) => (
        <HelmetCard key={helmet.helmetId} helmet={helmet} onView={onView} onDelete={onDelete} />
      ))}
    </div>
  );
}
