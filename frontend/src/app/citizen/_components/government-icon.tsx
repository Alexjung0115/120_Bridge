import Image from "next/image";
import governmentIcon from "@/assets/icon/government.svg";

export function GovernmentIcon() {
  return <Image src={governmentIcon} alt="" aria-hidden="true" className="size-6" />;
}
