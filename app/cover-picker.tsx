import { COVER_OPTIONS, CoverKey } from "./cover-options";

export function CoverPicker({
  value,
  name = "coverKey",
  onChange,
}: {
  value: CoverKey;
  name?: string;
  onChange?: (value: CoverKey) => void;
}) {
  return (
    <fieldset className="cover-picker">
      <legend>표지 선택</legend>
      <div className="cover-picker-grid">
        {COVER_OPTIONS.map((option) => (
          <label className={option.key === value ? "selected" : ""} key={option.key}>
            <input
              type="radio"
              name={name}
              value={option.key}
              checked={option.key === value}
              onChange={() => onChange?.(option.key)}
            />
            <img src={option.src} alt={option.alt} width={160} height={240} loading="lazy" />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
