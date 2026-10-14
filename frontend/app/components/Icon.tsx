import type { SVGProps } from "react";

// Solar Icons (Linear weight) — the authoritative source of all icon artwork.
// Each glyph is pulled in via its per-icon subpath so only the icons we map
// are bundled. See https://solar-icons.vercel.app/ — Solar Icon Set by
// 480 Design, licensed CC BY 4.0.
import { CalculatorMinimalisticIcon } from "@solar-icons/react/linear/calculator-minimalistic";
import { BoxIcon } from "@solar-icons/react/linear/box";
import { DeliveryIcon } from "@solar-icons/react/linear/delivery";
import { BlocksIcon } from "@solar-icons/react/linear/blocks";
import { Chart2Icon } from "@solar-icons/react/linear/chart-2";
import { UsersGroupRoundedIcon } from "@solar-icons/react/linear/users-group-rounded";
import { HeartIcon } from "@solar-icons/react/linear/heart";
import { BillListIcon } from "@solar-icons/react/linear/bill-list";
import { CardIcon } from "@solar-icons/react/linear/card";
import { WiFiOffIcon } from "@solar-icons/react/linear/wi-fi-off";
import { ShieldCheckIcon } from "@solar-icons/react/linear/shield-check";
import { CheckIcon } from "@solar-icons/react/linear/check";
import { ArrowRightIcon } from "@solar-icons/react/linear/arrow-right";
import { AddIcon } from "@solar-icons/react/linear/add";
import { LayersIcon } from "@solar-icons/react/linear/layers";
import { Shop2Icon } from "@solar-icons/react/linear/shop-2";
import { BuildingsIcon } from "@solar-icons/react/linear/buildings";
import { SettingsIcon } from "@solar-icons/react/linear/settings";
import { MagnifierIcon } from "@solar-icons/react/linear/magnifier";
import { Logout2Icon } from "@solar-icons/react/linear/logout-2";
import { BellIcon } from "@solar-icons/react/linear/bell";
import { MenuDotsIcon } from "@solar-icons/react/linear/menu-dots";
import { AltArrowDownIcon } from "@solar-icons/react/linear/alt-arrow-down";
import { RefreshIcon } from "@solar-icons/react/linear/refresh";
import { LockIcon } from "@solar-icons/react/linear/lock";
import { EyeIcon } from "@solar-icons/react/linear/eye";
import { EyeClosedIcon } from "@solar-icons/react/linear/eye-closed";
import { ForbiddenCircleIcon } from "@solar-icons/react/linear/forbidden-circle";
import { FileIcon } from "@solar-icons/react/linear/file";
import { WalletIcon } from "@solar-icons/react/linear/wallet";
import { TrashBinTrashIcon } from "@solar-icons/react/linear/trash-bin-trash";
import { CloseIcon } from "@solar-icons/react/linear/close";
import { HamburgerMenuIcon } from "@solar-icons/react/linear/hamburger-menu";
import { Pulse2Icon } from "@solar-icons/react/linear/pulse-2";
import { DatabaseIcon } from "@solar-icons/react/linear/database";
import { ClockCircleIcon } from "@solar-icons/react/linear/clock-circle";
import { TagIcon } from "@solar-icons/react/linear/tag";
import { HomeIcon } from "@solar-icons/react/linear/home";
import { CartLargeIcon } from "@solar-icons/react/linear/cart-large";
import { Banknote2Icon } from "@solar-icons/react/linear/banknote-2";
import { BoltIcon } from "@solar-icons/react/linear/bolt";
import { WidgetIcon } from "@solar-icons/react/linear/widget";
import { GalleryIcon } from "@solar-icons/react/linear/gallery";
import { UploadMinimalisticIcon } from "@solar-icons/react/linear/upload-minimalistic";
import { PenNewSquareIcon } from "@solar-icons/react/linear/pen-new-square";
import { FilterIcon } from "@solar-icons/react/linear/filter";
import { Sun2Icon } from "@solar-icons/react/linear/sun-2";
import { MoonIcon } from "@solar-icons/react/linear/moon";
import { DownloadMinimalisticIcon } from "@solar-icons/react/linear/download-minimalistic";
import { GraphUpIcon } from "@solar-icons/react/linear/graph-up";
import { PulseIcon } from "@solar-icons/react/linear/pulse";
import { MonitorIcon } from "@solar-icons/react/linear/monitor";
import { BackspaceIcon } from "@solar-icons/react/linear/backspace";
import { DangerCircleIcon } from "@solar-icons/react/linear/danger-circle";
import { QrCodeIcon } from "@solar-icons/react/linear/qr-code";
import { BarcodeScanIcon } from "@solar-icons/react/linear/barcode-scan";
import { PrinterIcon } from "@solar-icons/react/linear/printer";

export type IconName =
  | "pos"
  | "box"
  | "truck"
  | "factory"
  | "chart"
  | "users"
  | "heart"
  | "receipt"
  | "card"
  | "wifi-off"
  | "shield"
  | "check"
  | "arrow"
  | "plus"
  | "layers"
  // dashboard / admin / pos
  | "store"
  | "building"
  | "gear"
  | "search"
  | "logout"
  | "bell"
  | "dots"
  | "chevron"
  | "refresh"
  | "lock"
  | "eye"
  | "eye-off"
  | "ban"
  | "file"
  | "wallet"
  | "trash"
  | "x"
  | "menu"
  | "activity"
  | "database"
  | "clock"
  | "tag"
  | "home"
  | "cart"
  | "peso"
  | "bolt"
  | "grid"
  // inventory
  | "image"
  | "upload"
  | "pencil"
  | "filter"
  | "sun"
  | "moon"
  | "download"
  | "trend"
  | "pulse"
  | "monitor"
  // auth / hardware glyphs folded in from bespoke SVGs
  | "backspace"
  | "warning"
  | "qr"
  | "barcode"
  | "printer";

/** Every concrete Solar icon shares this component signature. */
type SolarIcon = typeof AddIcon;

/**
 * Maps each semantic {@link IconName} to its Solar Linear counterpart. Domain
 * names without a literal Solar glyph use the closest Linear-weight icon:
 * `pos` → calculator, `factory` → blocks, `truck` → delivery,
 * `receipt` → bill-list, `peso` → banknote.
 */
const ICONS: Record<IconName, SolarIcon> = {
  pos: CalculatorMinimalisticIcon,
  box: BoxIcon,
  truck: DeliveryIcon,
  factory: BlocksIcon,
  chart: Chart2Icon,
  users: UsersGroupRoundedIcon,
  heart: HeartIcon,
  receipt: BillListIcon,
  card: CardIcon,
  "wifi-off": WiFiOffIcon,
  shield: ShieldCheckIcon,
  check: CheckIcon,
  arrow: ArrowRightIcon,
  plus: AddIcon,
  layers: LayersIcon,
  store: Shop2Icon,
  building: BuildingsIcon,
  gear: SettingsIcon,
  search: MagnifierIcon,
  logout: Logout2Icon,
  bell: BellIcon,
  dots: MenuDotsIcon,
  chevron: AltArrowDownIcon,
  refresh: RefreshIcon,
  lock: LockIcon,
  eye: EyeIcon,
  "eye-off": EyeClosedIcon,
  ban: ForbiddenCircleIcon,
  file: FileIcon,
  wallet: WalletIcon,
  trash: TrashBinTrashIcon,
  x: CloseIcon,
  menu: HamburgerMenuIcon,
  activity: Pulse2Icon,
  database: DatabaseIcon,
  clock: ClockCircleIcon,
  tag: TagIcon,
  home: HomeIcon,
  cart: CartLargeIcon,
  peso: Banknote2Icon,
  bolt: BoltIcon,
  grid: WidgetIcon,
  image: GalleryIcon,
  upload: UploadMinimalisticIcon,
  pencil: PenNewSquareIcon,
  filter: FilterIcon,
  sun: Sun2Icon,
  moon: MoonIcon,
  download: DownloadMinimalisticIcon,
  trend: GraphUpIcon,
  pulse: PulseIcon,
  monitor: MonitorIcon,
  backspace: BackspaceIcon,
  warning: DangerCircleIcon,
  qr: QrCodeIcon,
  barcode: BarcodeScanIcon,
  printer: PrinterIcon,
};

/**
 * Renders one Solar Linear icon by semantic name. Inherits color via
 * `currentColor` and uses Solar's default 1.5 stroke; pass `className`
 * (e.g. `h-5 w-5`) to size it exactly as before.
 */
export function Icon({
  name,
  className,
  ...props
}: { name: IconName; className?: string } & SVGProps<SVGSVGElement>) {
  const SolarGlyph = ICONS[name];
  return <SolarGlyph className={className} {...props} />;
}

/**
 * Retained as a no-op for backwards compatibility. Icons used to reference a
 * shared SVG sprite; they now render self-contained Solar components, so the
 * sprite is no longer needed. Existing `<IconSprite />` mounts are harmless.
 */
export function IconSprite() {
  return null;
}
