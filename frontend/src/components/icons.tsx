import {
  ArrowLeft,
  ArrowRight,
  CalendarBlank,
  Car,
  CarProfile,
  CaretDown,
  BellRinging,
  ChartBar,
  FunnelSimple,
  MoonStars,
  SunDim,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  Clock,
  Coins,
  Copy,
  DotsSixVertical,
  DotsThreeVertical,
  Drop,
  GasPump,
  Info,
  Key,
  Leaf,
  Lightning,
  List,
  ListBullets,
  MagnifyingGlass,
  MapPin,
  Minus,
  PencilSimple,
  Plus,
  Repeat,
  RoadHorizon,
  ShareNetwork,
  SignOut,
  Trash,
  User,
  Users,
  X,
  type IconProps as PhosphorProps,
  type IconWeight,
} from '@phosphor-icons/react'

/**
 * The app's icons, from Phosphor (`@phosphor-icons/react`, named imports so
 * only the glyphs used here are bundled). The default weight is *regular*: a
 * plain rounded stroke. Phosphor's *duotone* weight paints a 20% fill of the
 * icon's silhouette under the stroke, and for line glyphs that silhouette is
 * a slab: a rectangle behind the three bars of the menu icon, a triangle
 * behind a chevron. On a phone that slab read as a grey grating around the
 * lines, so duotone is opt-in and used only where the fill is a real shape,
 * the car marks. Every icon takes `size` (px) and an optional `weight`; the
 * names below are the contract the components render against, so swapping
 * the pack again means editing this file only.
 */
type IconProps = Omit<PhosphorProps, 'weight'> & {
  size?: number
  weight?: IconWeight
  /** Legacy knob from the hand-drawn set: a heavy stroke now means the bold weight. */
  strokeWidth?: number
}

/** Phosphor's props for one of our icons: `size` in px, the weight resolved as above. */
function props({ size = 20, weight, strokeWidth, ...rest }: IconProps, fallback: IconWeight = 'regular'): PhosphorProps {
  const w = weight ?? (strokeWidth !== undefined && strokeWidth >= 2.25 ? 'bold' : fallback)
  return { size, weight: w, 'aria-hidden': true, focusable: false, ...rest }
}

/** The brand mark: a car seen from the front, its body tinted (duotone). */
export const CarIcon = (p: IconProps) => <Car {...props(p, 'duotone')} />
/** A car side-on: the vehicle pool, tinted like the brand mark. */
export const CarProfileIcon = (p: IconProps) => <CarProfile {...props(p, 'duotone')} />

export const BoltIcon = (p: IconProps) => <Lightning {...props(p)} />
/** A leaf, the usual "hybrid" mark. */
export const LeafIcon = (p: IconProps) => <Leaf {...props(p)} />
/** A fuel pump: petrol. */
export const PumpIcon = (p: IconProps) => <GasPump {...props(p)} />
/** A drop: diesel. */
export const DropIcon = (p: IconProps) => <Drop {...props(p)} />

export const PlusIcon = (p: IconProps) => <Plus {...props(p, 'bold')} />
export const MinusIcon = (p: IconProps) => <Minus {...props(p, 'bold')} />
export const MenuIcon = (p: IconProps) => <List {...props(p)} />
export const KebabIcon = (p: IconProps) => <DotsThreeVertical {...props(p, 'bold')} />
export const ChevronLeftIcon = (p: IconProps) => <CaretLeft {...props(p)} />
export const ChevronRightIcon = (p: IconProps) => <CaretRight {...props(p)} />
export const ChevronDownIcon = (p: IconProps) => <CaretDown {...props(p)} />
export const ArrowRightIcon = (p: IconProps) => <ArrowRight {...props(p)} />
export const ArrowLeftIcon = (p: IconProps) => <ArrowLeft {...props(p)} />
export const PinIcon = (p: IconProps) => <MapPin {...props(p)} />
export const GripIcon = (p: IconProps) => <DotsSixVertical {...props(p, 'bold')} />
export const TrashIcon = (p: IconProps) => <Trash {...props(p)} />
export const PencilIcon = (p: IconProps) => <PencilSimple {...props(p)} />
export const CopyIcon = (p: IconProps) => <Copy {...props(p)} />
export const XIcon = (p: IconProps) => <X {...props(p)} />
export const CheckIcon = (p: IconProps) => <Check {...props(p, 'bold')} />
export const CheckCircleIcon = (p: IconProps) => <CheckCircle {...props(p)} />
export const CalendarIcon = (p: IconProps) => <CalendarBlank {...props(p)} />
export const ListIcon = (p: IconProps) => <ListBullets {...props(p)} />
export const ClockIcon = (p: IconProps) => <Clock {...props(p)} />
export const UserIcon = (p: IconProps) => <User {...props(p)} />
export const UsersIcon = (p: IconProps) => <Users {...props(p)} />
export const LogoutIcon = (p: IconProps) => <SignOut {...props(p)} />
export const KeyIcon = (p: IconProps) => <Key {...props(p)} />
export const SearchIcon = (p: IconProps) => <MagnifyingGlass {...props(p)} />
export const InfoIcon = (p: IconProps) => <Info {...props(p)} />
export const ShareIcon = (p: IconProps) => <ShareNetwork {...props(p)} />
export const RepeatIcon = (p: IconProps) => <Repeat {...props(p)} />
/** A road: the distance of a ride. */
export const RoadIcon = (p: IconProps) => <RoadHorizon {...props(p)} />
/** Coins: the "chip in" note. */
export const CoinsIcon = (p: IconProps) => <Coins {...props(p)} />
export const BellIcon = (p: IconProps) => <BellRinging {...props(p)} />
export const ChartIcon = (p: IconProps) => <ChartBar {...props(p)} />
export const FilterIcon = (p: IconProps) => <FunnelSimple {...props(p)} />
export const SunIcon = (p: IconProps) => <SunDim {...props(p)} />
export const MoonIcon = (p: IconProps) => <MoonStars {...props(p)} />
