import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";

type SortSelectProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
};

export function SortSelect({ label, value, onChange }: SortSelectProps) {
  return (
    <NativeSelect aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
      <NativeSelectOption>최신순</NativeSelectOption>
      <NativeSelectOption>오래된순</NativeSelectOption>
    </NativeSelect>
  );
}
