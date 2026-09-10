/**
 * What the board knows about a car from its name alone.
 *
 * Three things: a *model* the board can draw (`carModel`, artwork in
 * `components/CarArt.tsx`), a *brand* whose logo it can show (`carBrand`,
 * marks from the `simple-icons` package) and what *drives* it
 * (`carPowertrain`: electric, hybrid, diesel, petrol or nothing to say). All run on
 * `Ride.car_name` ("Mazda 6e (BG-123-XY)", "grey Octavia") as well as on the
 * pool's own `CorporateCar.name`, so the plate suffix and any colour or
 * chit-chat around the name must be tolerated.
 */
export type CarModelKey = 'mazda6e'

export interface CarModel {
  key: CarModelKey
  name: string
  electric: boolean
}

const MODELS: { test: RegExp; model: CarModel }[] = [
  { test: /mazda\s*6\s*e\b/i, model: { key: 'mazda6e', name: 'Mazda 6e', electric: true } },
]

export function carModel(carName: string): CarModel | null {
  return MODELS.find((m) => m.test.test(carName))?.model ?? null
}

/** Keys are the `simple-icons` export names without the `si` prefix, lower-cased. */
export type CarBrandKey =
  | 'audi'
  | 'bmw'
  | 'volkswagen'
  | 'toyota'
  | 'honda'
  | 'ford'
  | 'skoda'
  | 'renault'
  | 'peugeot'
  | 'citroen'
  | 'fiat'
  | 'opel'
  | 'hyundai'
  | 'kia'
  | 'mazda'
  | 'nissan'
  | 'volvo'
  | 'tesla'
  | 'porsche'
  | 'subaru'
  | 'suzuki'
  | 'mitsubishi'
  | 'jeep'
  | 'chevrolet'
  | 'mini'
  | 'dacia'
  | 'seat'
  | 'smart'
  | 'polestar'
  | 'mg'
  | 'lada'
  | 'dsautomobiles'

export interface CarBrand {
  key: CarBrandKey
  name: string
}

/**
 * One row per brand: the makes people write (and misspell), then the models
 * they write instead of the make ("grey Octavia", "Golf"). Every word is
 * matched whole, so "Polo" does not fire on "Polonez". A word starting with
 * `=` must be written exactly like that (case included): it is a plain English
 * word too, and "7 seat van" or "a smart little car" must not grow a badge.
 * Bare numbers (Peugeot 208, BMW 320) are left out on purpose: too easy to hit
 * by accident.
 */
const BRANDS: { brand: CarBrand; makes: string[]; models: string[] }[] = [
  { brand: { key: 'volkswagen', name: 'Volkswagen' }, makes: ['volkswagen', 'vw', 'folksvagen'], models: ['golf', 'polo', 'passat', 'tiguan', 'touran', 'sharan', 'caddy', 'transporter', 'multivan', 'arteon', 't-roc', 't-cross', 'id.3', 'id.4', 'id.5', 'id.7', 'id. buzz', 'id.buzz', 'jetta', 'scirocco', 'touareg', 'amarok', 'lupo', 'bora', 'vento', 'beetle', 'buba'] },
  { brand: { key: 'skoda', name: 'Škoda' }, makes: ['škoda', 'skoda'], models: ['octavia', 'oktavija', 'fabia', 'fabija', 'superb', 'kodiaq', 'karoq', 'kamiq', '=Scala', '=Rapid', 'yeti', 'enyaq', 'roomster', 'citigo', 'elroq', 'felicia'] },
  { brand: { key: 'audi', name: 'Audi' }, makes: ['audi'], models: ['a1', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'q2', 'q3', 'q4', 'q5', 'q7', 'q8', 'e-tron', 'etron', '=TT', 'rs3', 'rs4', 'rs6', 's3', 's4', 's5'] },
  { brand: { key: 'bmw', name: 'BMW' }, makes: ['bmw', 'beemer', 'bimmer'], models: ['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'i3', 'i4', 'i5', 'i7', '=iX', 'ix1', 'ix2', 'ix3', 'm2', 'm3', 'm4', 'm5', '1 series', '2 series', '3 series', '5 series', '7 series', '1er', '3er', '5er', 'e36', 'e46', 'e90', 'f30', 'g20'] },
  { brand: { key: 'toyota', name: 'Toyota' }, makes: ['toyota', 'tojota'], models: ['corolla', 'korola', 'yaris', 'jaris', 'auris', 'avensis', 'rav4', 'rav-4', 'c-hr', 'chr', 'prius', 'aygo', 'camry', 'hilux', 'land cruiser', 'landcruiser', 'proace', 'supra', 'bz4x', 'verso'] },
  { brand: { key: 'honda', name: 'Honda' }, makes: ['honda'], models: ['civic', '=Jazz', '=Accord', 'cr-v', 'crv', 'hr-v', 'hrv', '=Fit', 'e:ny1'] },
  { brand: { key: 'ford', name: 'Ford' }, makes: ['ford'], models: ['=Focus', 'fiesta', 'fijesta', 'mondeo', 'kuga', '=Puma', 'mustang', '=Transit', '=Galaxy', 's-max', 'smax', 'c-max', 'cmax', 'b-max', '=Ranger', '=Explorer', '=Ka', 'ecosport', 'tourneo'] },
  { brand: { key: 'renault', name: 'Renault' }, makes: ['renault', 'reno'], models: ['clio', 'klio', 'megane', 'mégane', 'captur', 'kadjar', 'scenic', 'scénic', 'twingo', 'zoe', 'talisman', 'laguna', 'kangoo', 'trafic', 'austral', 'arkana', 'espace', 'koleos', 'symbol', 'thalia'] },
  { brand: { key: 'peugeot', name: 'Peugeot' }, makes: ['peugeot', 'pežo', 'pezo'], models: ['e-208', 'e-2008', 'rifter', '=Partner', '=Expert', '=Traveller', 'boxer'] },
  { brand: { key: 'citroen', name: 'Citroën' }, makes: ['citroën', 'citroen', 'citron'], models: ['berlingo', 'c1', 'c3', 'c4', 'c5', 'xsara', '=Picasso', '=Cactus', 'jumpy', 'jumper', 'spacetourer', 'saxo'] },
  { brand: { key: 'fiat', name: 'Fiat' }, makes: ['fiat', 'fijat', 'fića', 'fica'], models: ['punto', '=Panda', 'tipo', '=Bravo', 'stilo', 'doblo', 'doblò', 'ducato', '500x', '500l', '500e', 'cinquecento', 'seicento', 'grande punto', 'multipla'] },
  { brand: { key: 'opel', name: 'Opel' }, makes: ['opel'], models: ['astra', 'corsa', 'korsa', 'insignia', 'mokka', 'zafira', 'meriva', 'grandland', 'crossland', 'vectra', 'vivaro', '=Combo', 'agila', 'adam'] },
  { brand: { key: 'hyundai', name: 'Hyundai' }, makes: ['hyundai', 'hjundai'], models: ['i10', 'i20', 'i30', 'i40', 'tucson', 'kona', 'ioniq', 'santa fe', 'santafe', 'elantra', 'getz', 'bayon', 'accent'] },
  { brand: { key: 'kia', name: 'Kia' }, makes: ['kia'], models: ['ceed', "cee'd", 'sportage', 'niro', 'sorento', 'picanto', '=Rio', 'stonic', 'xceed', 'ev3', 'ev6', 'ev9', '=Soul', 'optima', 'stinger', 'cerato'] },
  { brand: { key: 'mazda', name: 'Mazda' }, makes: ['mazda'], models: ['mx-5', 'mx5', 'miata', 'cx-3', 'cx3', 'cx-30', 'cx30', 'cx-5', 'cx5', 'cx-60', 'cx60', 'cx-80', 'mazda 2', 'mazda 3', 'mazda 6', 'mazda2', 'mazda3', 'mazda6'] },
  { brand: { key: 'nissan', name: 'Nissan' }, makes: ['nissan'], models: ['qashqai', 'juke', '=Leaf', 'micra', 'x-trail', 'xtrail', '=Note', 'navara', 'ariya', 'primera', 'almera', 'pulsar', 'pathfinder'] },
  { brand: { key: 'volvo', name: 'Volvo' }, makes: ['volvo'], models: ['xc40', 'xc60', 'xc70', 'xc90', 'v40', 'v50', 'v60', 'v70', 'v90', 's40', 's60', 's80', 's90', 'ex30', 'ex90', 'c30', 'c40'] },
  { brand: { key: 'tesla', name: 'Tesla' }, makes: ['tesla'], models: ['model 3', 'model y', 'model s', 'model x', 'cybertruck'] },
  { brand: { key: 'porsche', name: 'Porsche' }, makes: ['porsche', 'porše', 'porse'], models: ['cayenne', 'macan', 'taycan', 'panamera', '911', 'boxster', 'cayman'] },
  { brand: { key: 'subaru', name: 'Subaru' }, makes: ['subaru'], models: ['forester', 'impreza', 'outback', '=Legacy', '=XV', 'wrx', 'levorg', 'crosstrek', 'solterra'] },
  { brand: { key: 'suzuki', name: 'Suzuki' }, makes: ['suzuki'], models: ['swift', 'vitara', 'jimny', 'ignis', 'sx4', 's-cross', 'baleno', 'celerio', '=Splash', 'alto'] },
  { brand: { key: 'mitsubishi', name: 'Mitsubishi' }, makes: ['mitsubishi', 'micubiši'], models: ['outlander', 'asx', 'eclipse cross', 'pajero', 'lancer', '=Colt', 'space star', 'l200'] },
  { brand: { key: 'jeep', name: 'Jeep' }, makes: ['jeep', 'džip'], models: ['wrangler', 'renegade', '=Compass', 'cherokee', '=Avenger', 'gladiator'] },
  { brand: { key: 'chevrolet', name: 'Chevrolet' }, makes: ['chevrolet', 'chevy', 'ševrolet'], models: ['aveo', 'cruze', '=Spark', 'captiva', 'camaro', 'corvette', '=Bolt', 'silverado', 'tahoe', 'kalos', 'lacetti'] },
  { brand: { key: 'mini', name: 'MINI' }, makes: ['=MINI', '=Mini'], models: ['mini cooper', '=Cooper', 'countryman', 'clubman'] },
  { brand: { key: 'dacia', name: 'Dacia' }, makes: ['dacia', 'dačija', 'dacija'], models: ['duster', 'sandero', 'logan', 'jogger', '=Spring', 'lodgy', 'dokker', 'bigster'] },
  { brand: { key: 'seat', name: 'SEAT' }, makes: ['=SEAT', '=Seat', 'cupra'], models: ['leon', 'león', 'ibiza', 'arona', 'ateca', 'tarraco', 'alhambra', 'toledo', 'altea', 'formentor', 'born', 'exeo'] },
  { brand: { key: 'smart', name: 'smart' }, makes: ['smart fortwo', 'smart forfour', 'smart eq', 'smart #1', 'smart #3'], models: ['fortwo', 'forfour'] },
  { brand: { key: 'polestar', name: 'Polestar' }, makes: ['polestar'], models: ['polestar 2', 'polestar 3', 'polestar 4'] },
  { brand: { key: 'mg', name: 'MG' }, makes: ['=MG'], models: ['mg4', 'mg5', 'mg zs', 'mg hs', 'mg3', 'zs ev'] },
  { brand: { key: 'lada', name: 'Lada' }, makes: ['lada'], models: ['niva', 'vesta', 'granta', 'žiguli', 'ziguli', 'samara'] },
  { brand: { key: 'dsautomobiles', name: 'DS' }, makes: ['ds automobiles'], models: ['ds3', 'ds4', 'ds7', 'ds9', 'ds 3', 'ds 4', 'ds 7', 'ds 9'] },
]

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const NOT_BEFORE = '(?<![\\p{L}\\p{N}])'
const NOT_AFTER = '(?![\\p{L}\\p{N}])'

/** Two tests per word list: the loose (any case) words and the `=` exact ones. */
function compile(words: string[]): RegExp[] {
  const loose = words.filter((w) => !w.startsWith('=')).map(escapeRe)
  const exact = words.filter((w) => w.startsWith('=')).map((w) => escapeRe(w.slice(1)))
  const out: RegExp[] = []
  if (loose.length) out.push(new RegExp(`${NOT_BEFORE}(?:${loose.join('|')})${NOT_AFTER}`, 'iu'))
  if (exact.length) out.push(new RegExp(`${NOT_BEFORE}(?:${exact.join('|')})${NOT_AFTER}`, 'u'))
  return out
}

// Compiled once. Makes and models are kept apart so a named make always wins:
// "Seat Leon" is SEAT, and "Golf" alone is Volkswagen.
const BRAND_TESTS = BRANDS.map(({ brand, makes, models }) => ({
  brand,
  makes: compile(makes),
  models: compile(models),
}))

/**
 * The brand a car name is talking about, or null. The plate suffix the server
 * appends to pool cars is stripped first, so "MG4 (FIRM-004)" is still MG and
 * a plate like "KA-123" cannot pass for a Ford Ka.
 */
export function carBrand(carName: string): CarBrand | null {
  const name = carName.replace(/\s*\([^)]*\)\s*$/, '')
  if (!name.trim()) return null
  const byMake = BRAND_TESTS.find((b) => b.makes.some((re) => re.test(name)))
  if (byMake) return byMake.brand
  return BRAND_TESTS.find((b) => b.models.some((re) => re.test(name)))?.brand ?? null
}

export type Powertrain = 'electric' | 'hybrid' | 'diesel' | 'petrol'

const POWERTRAIN_LABEL: Record<Powertrain, string> = { electric: 'Electric', hybrid: 'Hybrid', diesel: 'Diesel', petrol: 'Petrol' }

/** "Electric" / "Hybrid" / "Diesel" / "Petrol", for tags and titles. */
export function powertrainLabel(kind: Powertrain): string {
  return POWERTRAIN_LABEL[kind]
}

/**
 * Words that say outright what the car runs on: the fuel itself, in English
 * and Serbian, and the engine badges people copy off the boot lid (TDI, TSI,
 * dCi, TCe…). Hybrid words are checked first so "plug-in hybrid electric" is
 * a hybrid, then electric, diesel and petrol; "Niro EV" beats the hybrid Niro
 * below because a word always wins over a model. Same `=` rule as the brand
 * lists: Škoda's plug-ins are written "Octavia iV", and "IV" or "iv" is just
 * a generation number.
 */
const HYBRID_WORDS = ['hybrid', 'hibrid', 'hibridni', 'hibridna', 'hibridno', 'hybride', 'ehybrid', 'e-hybrid', 'phev', 'hev', 'mhev', 'plug-in', 'plugin', 'gte', '4xe', 'e-power', '=iV']
const ELECTRIC_WORDS = ['electric', 'electro', 'elektro', 'električni', 'električna', 'električno', 'elektricni', 'elektricna', 'elektricno', 'na struju', 'ev', 'bev', 'e-auto', 'e-car']
const DIESEL_WORDS = ['diesel', 'dizel', 'dizelaš', 'dizelas', 'dízel', 'tdi', 'tdci', 'hdi', 'bluehdi', 'blue hdi', 'e-hdi', 'ehdi', 'cdi', 'dci', 'crdi', 'd-4d', 'd4d', 'jtd', 'jtdm', 'multijet', 'mjet', 'sdi', 'cdti', 'dtec', 'i-dtec', 'skyactiv-d', 'ddis', 'di-d', 'bluetec', 'd-cat']
const PETROL_WORDS = ['petrol', 'benzin', 'benzinac', 'benzinski', 'benzinska', 'gasoline', 'tsi', 'tfsi', 'fsi', 'mpi', 'gti', 'gdi', 't-gdi', 'tgdi', 'vti', 'thp', 'puretech', 'tce', 'ecoboost', 'skyactiv-g', 'vvt-i', 'vvti', 'i-vtec', 'vtec', 'ecotec', 'firefly', 'multiair', 'twinair']

/**
 * Models sold only with that drivetrain, so the name alone settles it. Ones
 * that come both ways (Kona, Niro, Ioniq, Corolla…) are left to the words
 * above. Tesla and Polestar make nothing else, so the make is enough.
 */
const ELECTRIC_MODELS = [
  'tesla', 'polestar', 'mazda 6e', 'mazda6e',
  'id.3', 'id.4', 'id.5', 'id.7', 'id. buzz', 'id.buzz', 'e-golf', 'e-up',
  'e-tron', 'etron', 'q4 e-tron', 'q6 e-tron',
  'i3', 'i4', 'i5', 'i7', '=iX', 'ix1', 'ix2', 'ix3',
  'zoe', 'megane e-tech', 'scenic e-tech', 'scénic e-tech', '=Leaf', 'ariya', 'e-208', 'e-2008', 'e-308', 'e-c4', 'e-berlingo',
  '500e', '600e', 'enyaq', 'elroq', 'ev3', 'ev6', 'ev9', 'niro ev', 'kona electric', 'ioniq 5', 'ioniq 6', 'inster',
  'bz4x', 'taycan', 'solterra', 'ex30', 'ex90', 'ec40', 'mg4', 'mg5', 'zs ev', '=Spring', '=Born', 'mach-e', 'mach e',
  'e:ny1', 'honda e', 'cybertruck', 'model 3', 'model y', 'model s', 'model x', 'smart eq', 'smart #1', 'smart #3',
  'e-transit', 'e-vito', 'eqa', 'eqb', 'eqc', 'eqe', 'eqs', 'mokka-e', 'corsa-e', 'astra electric', 'ampera-e',
]
const HYBRID_MODELS = ['prius', 'niro', 'ioniq', 'yaris cross', 'c-hr', 'chr', 'rav4 phev', 'outlander phev', 'e-tech']

const HYBRID_TESTS = compile(HYBRID_WORDS)
const ELECTRIC_TESTS = compile(ELECTRIC_WORDS)
const DIESEL_TESTS = compile(DIESEL_WORDS)
const PETROL_TESTS = compile(PETROL_WORDS)
const ELECTRIC_MODEL_TESTS = compile(ELECTRIC_MODELS)
const HYBRID_MODEL_TESTS = compile(HYBRID_MODELS)
// BMW says it with the letter after the number: 330e is a plug-in, 320d a
// diesel, 320i petrol. Only once the make is known, so a bare "320d" does not count.
const BMW_PLUGIN = new RegExp(`${NOT_BEFORE}\\d{2,3}e${NOT_AFTER}`, 'iu')
const BMW_DIESEL = new RegExp(`${NOT_BEFORE}\\d{3}d${NOT_AFTER}`, 'iu')
const BMW_PETROL = new RegExp(`${NOT_BEFORE}\\d{3}i${NOT_AFTER}`, 'iu')

/**
 * Electric, hybrid, diesel, petrol or null (simply unsaid), from the name.
 * The plate suffix is stripped first so "EV-123" on a plate does not count.
 * A drawn model that is electric (`CarModel.electric`) counts as such too.
 */
export function carPowertrain(carName: string): Powertrain | null {
  const name = carName.replace(/\s*\([^)]*\)\s*$/, '')
  if (!name.trim()) return null
  if (HYBRID_TESTS.some((re) => re.test(name))) return 'hybrid'
  if (ELECTRIC_TESTS.some((re) => re.test(name))) return 'electric'
  if (DIESEL_TESTS.some((re) => re.test(name))) return 'diesel'
  if (PETROL_TESTS.some((re) => re.test(name))) return 'petrol'
  if (carModel(name)?.electric) return 'electric'
  if (ELECTRIC_MODEL_TESTS.some((re) => re.test(name))) return 'electric'
  if (HYBRID_MODEL_TESTS.some((re) => re.test(name))) return 'hybrid'
  if (carBrand(name)?.key === 'bmw') {
    if (BMW_PLUGIN.test(name)) return 'hybrid'
    if (BMW_DIESEL.test(name)) return 'diesel'
    if (BMW_PETROL.test(name)) return 'petrol'
  }
  return null
}
