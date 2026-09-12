type DoorVisual = "closed" | "safe" | "alarm";

type Props = {
  index: number;
  visual: DoorVisual;
  disabled: boolean;
  onClick: (index: number) => void;
};

export function DoorCard({ index, visual, disabled, onClick }: Props) {
  return (
    <button
      className={`door door-${visual}`}
      disabled={disabled}
      onClick={() => onClick(index)}
    >
      <span className="door-icon">
        {visual === "closed" && "🚪"}
        {visual === "safe" && "💰"}
        {visual === "alarm" && "🚨"}
      </span>
      <span className="door-num">Porte {index + 1}</span>
    </button>
  );
}
