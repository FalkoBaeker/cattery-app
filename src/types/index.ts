/**
 * Domänenmodell der Cattery-App.
 *
 * Diese Datei ist der verbindliche Vertrag zwischen allen Modulen.
 * Änderungen hier betreffen jedes Feature — bitte nur additiv erweitern
 * und niemals bestehende Felder umbenennen, ohne die DB-Version zu erhöhen.
 *
 * Konventionen:
 *  - `ISODate`     = "2026-03-03"            (reines Datum, lokale Zeitzone gemeint)
 *  - `ISODateTime` = "2026-03-03T14:05:00Z"  (echter Zeitpunkt, immer UTC gespeichert)
 *  - Geldbeträge   = immer in Cent als Ganzzahl (nie Fließkomma!)
 *  - Gewichte      = immer in Gramm als Ganzzahl
 */

export type ID = string;
export type ISODate = string;
export type ISODateTime = string;

/** Basisfelder, die jeder gespeicherte Datensatz trägt. */
export interface Timestamped {
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/*  Gemeinsame Aufzählungen                                            */
/* ------------------------------------------------------------------ */

export type Sex = 'male' | 'female';

/** Geschlecht inkl. "noch unbekannt" — bei Neugeborenen erst später bestimmt. */
export type SexOrUnknown = Sex | 'unknown';

export const SEX_LABEL: Record<SexOrUnknown, string> = {
  male: 'Kater',
  female: 'Katze',
  unknown: 'unbekannt',
};

/**
 * Halsbandfarben zur Unterscheidung der Kitten.
 * Das ist die *primäre* Identität eines Kittens — Rufnamen kommen später (F33).
 * Reihenfolge = Vorschlagsreihenfolge beim Anlegen eines Wurfes.
 */
export const COLLAR_COLORS = [
  { key: 'red', label: 'Rot', hex: '#e5484d' },
  { key: 'blue', label: 'Blau', hex: '#3b82f6' },
  { key: 'green', label: 'Grün', hex: '#30a46c' },
  { key: 'yellow', label: 'Gelb', hex: '#f5b800' },
  { key: 'purple', label: 'Lila', hex: '#8e4ec6' },
  { key: 'orange', label: 'Orange', hex: '#f76b15' },
  { key: 'pink', label: 'Rosa', hex: '#e93d82' },
  { key: 'turquoise', label: 'Türkis', hex: '#00a2c7' },
  { key: 'white', label: 'Weiß', hex: '#d7dbdf' },
  { key: 'black', label: 'Schwarz', hex: '#4a4a4a' },
  { key: 'brown', label: 'Braun', hex: '#8b5a2b' },
  { key: 'none', label: 'ohne', hex: '#9ca3af' },
] as const;

export type CollarColorKey = (typeof COLLAR_COLORS)[number]['key'];

export function collarColor(key: CollarColorKey) {
  return COLLAR_COLORS.find((c) => c.key === key) ?? COLLAR_COLORS[COLLAR_COLORS.length - 1];
}

/* ------------------------------------------------------------------ */
/*  Katze (Zuchttier)                                                  */
/* ------------------------------------------------------------------ */

export type CatStatus =
  | 'active' /** in der Zucht */
  | 'paused' /** Wurfpause */
  | 'neutered' /** kastriert, bleibt im Haushalt */
  | 'placed' /** abgegeben */
  | 'deceased';

export const CAT_STATUS_LABEL: Record<CatStatus, string> = {
  active: 'In der Zucht',
  paused: 'Wurfpause',
  neutered: 'Kastriert',
  placed: 'Abgegeben',
  deceased: 'Verstorben',
};

export interface Cat extends Timestamped {
  id: ID;
  /** Rufname — einziges Pflichtfeld. */
  callName: string;
  /** Vollständiger Zuchtname inkl. Zwinger. */
  catteryName?: string;
  sex: Sex;
  birthDate?: ISODate;
  breed: string;
  /** EMS-Code, bei Russisch Blau i. d. R. "RUS a". */
  emsCode?: string;
  /** Nummer auf dem Stammbaum des Vereins. */
  registrationNo?: string;
  chipNo?: string;
  bloodGroup?: string;
  /** Züchter, von dem das Tier stammt. */
  breederName?: string;
  status: CatStatus;
  /** false = fremder Deckkater, nur als Referenz angelegt. */
  isOwn: boolean;
  /** Anzahl der Generationen im hinterlegten Stammbaum-Scan. */
  pedigreeDocumentId?: ID;
  /** Ahnenverlust/Inzuchtkoeffizient, extern berechnet (z. B. PawPeds), in Prozent. */
  inbreedingPercent?: number;
  photoAttachmentId?: ID;
  notes?: string;
}

/** Rolligkeit einer Königin. */
export interface HeatCycle extends Timestamped {
  id: ID;
  catId: ID;
  startDate: ISODate;
  endDate?: ISODate;
  notes?: string;
}

export type HealthTestKind = 'hcm' | 'pkd' | 'felv_fiv' | 'genetic' | 'other';

export const HEALTH_TEST_LABEL: Record<HealthTestKind, string> = {
  hcm: 'HCM (Herzultraschall)',
  pkd: 'PKD (Nierenultraschall)',
  felv_fiv: 'FeLV / FIV',
  genetic: 'Gentest',
  other: 'Weiterer Test',
};

/** Vorgabe, wie lange ein Ergebnis üblicherweise gilt (Monate). 0 = einmalig gültig. */
export const HEALTH_TEST_DEFAULT_VALIDITY: Record<HealthTestKind, number> = {
  hcm: 6,
  pkd: 6,
  felv_fiv: 12,
  genetic: 0,
  other: 0,
};

export interface HealthTest extends Timestamped {
  id: ID;
  catId: ID;
  kind: HealthTestKind;
  /** Freier Name, wenn kind = 'genetic' oder 'other'. */
  label?: string;
  date: ISODate;
  result?: string;
  /** Gültigkeitsdauer in Monaten; 0/undefined = unbefristet. */
  validMonths?: number;
  /** Errechnet aus date + validMonths, für den Index mitgespeichert. */
  nextDueDate?: ISODate;
  documentId?: ID;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/*  Wurf                                                               */
/* ------------------------------------------------------------------ */

export type LitterStatus =
  | 'planned' /** Verpaarung geplant */
  | 'mated' /** gedeckt */
  | 'pregnant' /** trächtig bestätigt */
  | 'born' /** Kitten sind da */
  | 'completed' /** alle abgegeben */
  | 'cancelled';

export const LITTER_STATUS_LABEL: Record<LitterStatus, string> = {
  planned: 'Geplant',
  mated: 'Gedeckt',
  pregnant: 'Trächtig',
  born: 'Geboren',
  completed: 'Abgeschlossen',
  cancelled: 'Abgebrochen',
};

export interface Litter extends Timestamped {
  id: ID;
  motherId: ID;
  /** Eigener Kater aus der Katzenliste. */
  fatherId?: ID;
  /** Fremder Deckkater, nur als Name erfasst. */
  fatherExternalName?: string;
  matingDate?: ISODate;
  /** matingDate + Trächtigkeitsdauer aus den Einstellungen (Vorgabe 65 Tage). */
  dueDate?: ISODate;
  birthDate?: ISODate;
  status: LitterStatus;
  notes?: string;
}

export type BirthEventKind = 'contraction' | 'kitten_born' | 'placenta' | 'note';

export const BIRTH_EVENT_LABEL: Record<BirthEventKind, string> = {
  contraction: 'Wehe',
  kitten_born: 'Kitten geboren',
  placenta: 'Nachgeburt',
  note: 'Notiz',
};

/** Ein Eintrag im Geburtsprotokoll. */
export interface BirthEvent {
  id: ID;
  litterId: ID;
  at: ISODateTime;
  kind: BirthEventKind;
  kittenId?: ID;
  note?: string;
}

/* ------------------------------------------------------------------ */
/*  Kitten                                                             */
/* ------------------------------------------------------------------ */

export type KittenSaleStatus =
  | 'available' /** frei */
  | 'reserved' /** vorgemerkt */
  | 'sold' /** verkauft, Standardvertrag */
  | 'sold_breeding_reserved' /** verkauft mit Zuchtnutzungsvorbehalt — KEINE Kastration! */
  | 'kept' /** bleibt bei uns */
  | 'deceased';

export const KITTEN_SALE_STATUS_LABEL: Record<KittenSaleStatus, string> = {
  available: 'Frei',
  reserved: 'Vorgemerkt',
  sold: 'Verkauft',
  sold_breeding_reserved: 'Verkauft mit Zuchtvorbehalt',
  kept: 'Bleibt bei uns',
  deceased: 'Verstorben',
};

export interface Kitten extends Timestamped {
  id: ID;
  litterId: ID;
  /** Primäre Identität, solange es keinen Rufnamen gibt. */
  collarColor: CollarColorKey;
  callName?: string;
  sex: SexOrUnknown;
  birthWeightG?: number;
  bornAt?: ISODateTime;
  stillborn: boolean;
  chipNo?: string;
  saleStatus: KittenSaleStatus;
  /** Verknüpfter Interessent, sobald reserviert/verkauft. */
  interestId?: ID;
  priceCents?: number;
  diedAt?: ISODate;
  deathNote?: string;
  photoAttachmentId?: ID;
  notes?: string;
}

/** Anzeigename eines Kittens: Rufname, sonst Halsbandfarbe. */
export function kittenLabel(k: Pick<Kitten, 'callName' | 'collarColor'>): string {
  return k.callName?.trim() || collarColor(k.collarColor).label;
}

/* ------------------------------------------------------------------ */
/*  Gewichte                                                           */
/* ------------------------------------------------------------------ */

export interface WeightEntry {
  id: ID;
  kittenId: ID;
  at: ISODateTime;
  grams: number;
  note?: string;
}

/** Gewicht eines erwachsenen Tieres (v. a. Königin während der Trächtigkeit, F31). */
export interface CatWeightEntry {
  id: ID;
  catId: ID;
  at: ISODateTime;
  grams: number;
  note?: string;
}

/* ------------------------------------------------------------------ */
/*  Fahrplan (automatisch erzeugte Aufgaben)                           */
/* ------------------------------------------------------------------ */

export type CareTaskKind =
  | 'deworming'
  | 'vaccination'
  | 'chip'
  | 'neuter'
  | 'litter_registration'
  | 'handover_allowed'
  | 'health_test'
  | 'custom';

export const CARE_TASK_LABEL: Record<CareTaskKind, string> = {
  deworming: 'Entwurmung',
  vaccination: 'Impfung',
  chip: 'Chippen',
  neuter: 'Kastration',
  litter_registration: 'Wurfmeldung',
  handover_allowed: 'Abgabe erlaubt',
  health_test: 'Gesundheitstest',
  custom: 'Aufgabe',
};

export interface CareTask extends Timestamped {
  id: ID;
  kind: CareTaskKind;
  title: string;
  dueDate: ISODate;
  doneAt?: ISODate;
  /** Wurfweite Aufgabe, wenn kittenId leer bleibt. */
  litterId?: ID;
  kittenId?: ID;
  catId?: ID;
  /** true = vom Fahrplan erzeugt; wird bei Neuberechnung ersetzt, sofern nicht erledigt. */
  autoGenerated: boolean;
  /** Stabile Kennung zur Wiedererkennung beim Neuberechnen, z. B. "deworming:1". */
  planKey?: string;
  detail?: string;
  skipped?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Interessenten / Warteliste                                         */
/* ------------------------------------------------------------------ */

export type InterestStatus =
  | 'new'
  | 'contacted'
  | 'shortlisted'
  | 'reserved'
  | 'completed'
  | 'declined';

export const INTEREST_STATUS_LABEL: Record<InterestStatus, string> = {
  new: 'Neu',
  contacted: 'Kontakt',
  shortlisted: 'Vorgemerkt',
  reserved: 'Reserviert',
  completed: 'Abgeholt',
  declined: 'Abgesagt',
};

export type WishSex = Sex | 'any';

export const WISH_SEX_LABEL: Record<WishSex, string> = {
  male: 'Kater',
  female: 'Katze',
  any: 'egal',
};

export interface Interest extends Timestamped {
  id: ID;
  /** Einziges Pflichtfeld. */
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  /** Woher kam die Anfrage (F79: meist eigene Homepage). */
  source?: string;
  wishSex: WishSex;
  wishTimeframe?: string;
  /** Fragebogen (F69/F77). */
  allergySufferer?: boolean;
  hasOtherPets?: boolean;
  hasChildren?: boolean;
  outdoorPlanned?: boolean;
  householdNote?: string;
  /** Angebotener/vereinbarter Preis in Cent (F68 ausdrücklich erlaubt). */
  offeredPriceCents?: number;
  status: InterestStatus;
  /** Reihenfolge in der Warteliste; kleiner = weiter oben. */
  sortIndex: number;
  /** Verknüpftes Kitten, sobald reserviert. */
  kittenId?: ID;
  notes?: string;
  /** Papierkorb: gesetzt = ausgeblendet, wird nach 30 Tagen endgültig gelöscht. */
  deletedAt?: ISODateTime;
}

export type ContactChannel = 'call' | 'whatsapp' | 'email' | 'visit' | 'other';

export const CONTACT_CHANNEL_LABEL: Record<ContactChannel, string> = {
  call: 'Anruf',
  whatsapp: 'WhatsApp',
  email: 'E-Mail',
  visit: 'Besuch',
  other: 'Sonstiges',
};

export interface InterestNote {
  id: ID;
  interestId: ID;
  at: ISODateTime;
  channel: ContactChannel;
  text: string;
}

/* ------------------------------------------------------------------ */
/*  Termine                                                            */
/* ------------------------------------------------------------------ */

export type AppointmentKind =
  | 'meet_breeder' /** Kennenlernen (F82) */
  | 'allergy_test' /** Allergietest */
  | 'meet_kittens' /** Kitten kennenlernen */
  | 'pickup' /** Abholung */
  | 'vet' /** Tierarzt — eigene Kategorie, kein Besuchstermin */
  | 'mating' /** Deckbesuch */
  | 'other';

export const APPOINTMENT_KIND_LABEL: Record<AppointmentKind, string> = {
  meet_breeder: 'Kennenlernen',
  allergy_test: 'Allergietest',
  meet_kittens: 'Kitten kennenlernen',
  pickup: 'Abholung',
  vet: 'Tierarzt',
  mating: 'Deckbesuch',
  other: 'Sonstiges',
};

/** Termine, bei denen ein Interessent zu Besuch kommt. */
export const VISITOR_APPOINTMENT_KINDS: AppointmentKind[] = [
  'meet_breeder',
  'allergy_test',
  'meet_kittens',
  'pickup',
];

export interface Appointment extends Timestamped {
  id: ID;
  kind: AppointmentKind;
  startAt: ISODateTime;
  durationMin?: number;
  title?: string;
  interestId?: ID;
  catId?: ID;
  litterId?: ID;
  kittenIds?: ID[];
  location?: string;
  note?: string;
  remind24h: boolean;
  remind1h: boolean;
  /** Nachbereitung: wurde schon nach dem Verlauf gefragt? (F85) */
  followUpDone?: boolean;
  doneAt?: ISODateTime;
  cancelledAt?: ISODateTime;
}

/* ------------------------------------------------------------------ */
/*  Dokumente und Anhänge                                              */
/* ------------------------------------------------------------------ */

export type DocumentKind =
  | 'pedigree'
  | 'vaccination_card'
  | 'health_test'
  | 'contract'
  | 'invoice'
  | 'other';

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  pedigree: 'Stammbaum',
  vaccination_card: 'Impfpass',
  health_test: 'Testergebnis',
  contract: 'Vertrag',
  invoice: 'Rechnung',
  other: 'Sonstiges',
};

export interface DocumentRec extends Timestamped {
  id: ID;
  kind: DocumentKind;
  title: string;
  catId?: ID;
  kittenId?: ID;
  litterId?: ID;
  interestId?: ID;
  /** Seiten in Reihenfolge; verweist auf Attachment-Datensätze. */
  pageIds: ID[];
  /** Darf Interessenten gezeigt/geteilt werden (F92). */
  customerVisible: boolean;
  notes?: string;
}

/**
 * Binärdaten (Bilder, PDFs). Getrennt von den Metadaten gespeichert,
 * damit Listenabfragen keine Blobs mitladen.
 */
export interface Attachment {
  id: ID;
  blob: Blob;
  mime: string;
  bytes: number;
  width?: number;
  height?: number;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/*  Verträge                                                           */
/* ------------------------------------------------------------------ */

export type ContractType = 'standard' | 'breeding_reserved';

export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  standard: 'Kaufvertrag',
  breeding_reserved: 'Kaufvertrag mit Zuchtnutzungsvorbehalt',
};

/** Eine Vertragspartei auf Käuferseite. */
export interface ContractParty {
  name: string;
  address?: string;
  birthDate?: ISODate;
  /** Steuert die Grammatik: "der Käufer" / "die Käuferin". */
  sex?: Sex;
}

/** Ein im Vertrag genanntes Tier. */
export interface ContractAnimal {
  kittenId?: ID;
  catId?: ID;
  name: string;
  sex: Sex;
  birthDate?: ISODate;
  chipNo?: string;
}

export interface ContractData {
  type: ContractType;
  buyers: ContractParty[];
  animals: ContractAnimal[];
  breed: string;

  /* Standardvertrag */
  totalPriceCents?: number;
  depositCents?: number;
  handoverText?: string;
  handoverPlace?: string;

  /* Zuchtnutzungsvertrag */
  regularPriceCents?: number;
  discountCents?: number;
  /** Fristbeginn — wird als Baustein eingetragen (Antwort 5). */
  breedingUseStartDate?: ISODate;
  breedingUseMonths?: number;
  breedingUseExtensionMonths?: number;
  handoverDeadlineDays?: number;
  matingAttempts?: number;
  backPaymentDays?: number;

  /* Beide */
  signPlace?: string;
  signDate?: ISODate;
  /** Optionaler Schlussparagraf, wird nur gedruckt wenn gefüllt. */
  additionalAgreement?: string;
}

export interface Contract extends Timestamped {
  id: ID;
  type: ContractType;
  data: ContractData;
  /** Erzeugtes PDF, dauerhaft gespeichert (Antwort 6). */
  pdfAttachmentId?: ID;
  litterId?: ID;
  interestId?: ID;
  notes?: string;
}

/* ------------------------------------------------------------------ */
/*  Zuchtnutzungs-Vorgang (18-Monats-Frist)                            */
/* ------------------------------------------------------------------ */

export type BreedingUseStage =
  | 'at_buyer'
  | 'requested'
  | 'with_us'
  | 'mated'
  | 'pregnant'
  | 'littered'
  | 'neutered'
  | 'ownership_transferred'
  | 'closed'
  | 'cancelled';

export const BREEDING_USE_STAGE_LABEL: Record<BreedingUseStage, string> = {
  at_buyer: 'Katze beim Käufer',
  requested: 'Zur Deckung angefordert',
  with_us: 'Bei uns',
  mated: 'Gedeckt',
  pregnant: 'Trächtig',
  littered: 'Wurf da',
  neutered: 'Kastriert',
  ownership_transferred: 'Eigentum übertragen',
  closed: 'Abgeschlossen',
  cancelled: 'Abgebrochen',
};

export const BREEDING_USE_STAGE_ORDER: BreedingUseStage[] = [
  'at_buyer',
  'requested',
  'with_us',
  'mated',
  'pregnant',
  'littered',
  'neutered',
  'ownership_transferred',
  'closed',
];

export interface BreedingUse extends Timestamped {
  id: ID;
  contractId: ID;
  /** Die betroffene Katze, sofern sie als Zuchttier geführt wird. */
  catId?: ID;
  kittenId?: ID;
  catName: string;
  /** Fristbeginn: erstmalige Überlassung. */
  startDate: ISODate;
  months: number;
  extensionMonths: number;
  extendedAt?: ISODate;
  /** Errechnet, für Index und Sortierung mitgespeichert. */
  deadlineDate: ISODate;
  stage: BreedingUseStage;
  history: { stage: BreedingUseStage; at: ISODateTime; note?: string }[];
  notes?: string;
}

/* ------------------------------------------------------------------ */
/*  Kosten                                                             */
/* ------------------------------------------------------------------ */

export type CostCategory =
  | 'vet'
  | 'emergency'
  | 'medication'
  | 'vaccination'
  | 'neutering'
  | 'stud_fee'
  | 'food'
  | 'registration'
  | 'equipment'
  | 'other';

export const COST_CATEGORY_LABEL: Record<CostCategory, string> = {
  vet: 'Tierarzt',
  emergency: 'Notfall',
  medication: 'Medikamente',
  vaccination: 'Impfungen',
  neutering: 'Kastration',
  stud_fee: 'Deckgebühr',
  food: 'Futter',
  registration: 'Zuchtbuch / Verein',
  equipment: 'Anschaffungen',
  other: 'Sonstiges',
};

export interface CostEntry extends Timestamped {
  id: ID;
  date: ISODate;
  category: CostCategory;
  amountCents: number;
  litterId?: ID;
  catId?: ID;
  kittenId?: ID;
  note?: string;
}

export interface RevenueEntry extends Timestamped {
  id: ID;
  date: ISODate;
  amountCents: number;
  litterId?: ID;
  kittenId?: ID;
  note?: string;
}

/* ------------------------------------------------------------------ */
/*  Einstellungen                                                      */
/* ------------------------------------------------------------------ */

export type ModuleKey =
  | 'cats'
  | 'litters'
  | 'weights'
  | 'waitlist'
  | 'appointments'
  | 'documents'
  | 'contracts'
  | 'costs';

export const MODULE_LABEL: Record<ModuleKey, string> = {
  cats: 'Zuchttiere',
  litters: 'Würfe & Kitten',
  weights: 'Gewichte',
  waitlist: 'Warteliste',
  appointments: 'Termine',
  documents: 'Dokumente',
  contracts: 'Verträge',
  costs: 'Kosten',
};

/** Stammdaten der Verkäuferin. Bleiben ausschließlich auf dem Gerät. */
export interface SellerSettings {
  name: string;
  address: string;
  birthDate?: ISODate;
  iban?: string;
  /** Standard-Übergabeort. */
  place?: string;
  catteryName?: string;
  clubName: string;
}

/** Schwellen für die Gewichtsbewertung (F14–F18). */
export interface WeightThresholds {
  /** Ab dieser Tageszunahme ist alles in Ordnung. */
  goodGainG: number;
  /** Darunter wird beobachtet. */
  watchGainG: number;
  /** Absolutes Gewicht, unter dem ein Neugeborenes als Sorgenkind gilt. */
  concernBirthWeightG: number;
  /** Abweichung vom Wurfdurchschnitt in Prozent, ab der gewarnt wird. */
  belowLitterAvgPercent: number;
  /** Erwartetes Geburtsgewicht der Rasse. */
  typicalBirthWeightG: number;
}

/** Der automatische 12-Wochen-Fahrplan. */
export interface SchedulePlan {
  dewormingWeeks: number[];
  vaccinationWeeks: number[];
  chipWeek: number;
  neuterWeek: number;
  litterRegistrationWeek: number;
  handoverWeek: number;
  /** Vorlauf der Erinnerung in Tagen. */
  reminderLeadDays: number;
  dewormingDrug?: string;
}

export interface Settings {
  id: 'singleton';
  seller: SellerSettings;
  breed: string;
  gestationDays: number;
  defaultKittenPriceCents?: number;
  /** Verbandsregel: maximale Würfe je Königin im Zeitraum. */
  maxLittersPerQueen: number;
  maxLittersWithinMonths: number;
  weight: WeightThresholds;
  schedule: SchedulePlan;
  modules: Record<ModuleKey, boolean>;
  theme: 'system' | 'light' | 'dark';
  backupIntervalDays: number;
  lastBackupAt?: ISODateTime;
  /** Vorlage für die WhatsApp-Serienbenachrichtigung. */
  whatsappTemplate?: string;
  onboardingDoneAt?: ISODateTime;
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'singleton',
  seller: {
    name: '',
    address: '',
    clubName: 'Catmaniac',
  },
  breed: 'Russisch Blau',
  gestationDays: 65,
  maxLittersPerQueen: 3,
  maxLittersWithinMonths: 24,
  weight: {
    goodGainG: 7,
    watchGainG: 6,
    concernBirthWeightG: 80,
    belowLitterAvgPercent: 15,
    typicalBirthWeightG: 90,
  },
  schedule: {
    dewormingWeeks: [4, 6, 8],
    vaccinationWeeks: [8, 12],
    chipWeek: 8,
    neuterWeek: 10,
    litterRegistrationWeek: 10,
    handoverWeek: 12,
    reminderLeadDays: 4,
    dewormingDrug: 'Fenbendazol',
  },
  modules: {
    cats: true,
    litters: true,
    weights: true,
    waitlist: true,
    appointments: true,
    documents: true,
    contracts: true,
    costs: true,
  },
  theme: 'system',
  backupIntervalDays: 14,
  whatsappTemplate:
    'Hallo {name},\n\nbei uns sind Kitten geboren! Wenn du magst, melde dich gern bei uns.\n\nLiebe Grüße',
};
