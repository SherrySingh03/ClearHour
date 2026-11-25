/**
 * Cities offered in the picker. These are only coordinates and names.
 * Coverage is NOT hard-coded: whether a city has a live CPCB station is
 * decided at request time by station resolution. A city whose stations are
 * offline today gets the honest "no station — forecast only" state.
 *
 * Names are keyed by locale. To add a language, add a key here.
 */

import type { Locale } from "../i18n/locales";
import type { LatLon } from "./types";

export interface City {
  readonly id: string;
  readonly names: Readonly<Record<Locale, string>>;
  readonly state: string;
  readonly center: LatLon;
}

const c = (id: string, en: string, hi: string, state: string, latitude: number, longitude: number): City => ({
  id,
  names: { en, hi },
  state,
  center: { latitude, longitude },
});

export const CITIES: readonly City[] = [
  c("delhi", "Delhi", "दिल्ली", "DL", 28.6139, 77.209),
  c("noida", "Noida", "नोएडा", "UP", 28.5355, 77.391),
  c("gurugram", "Gurugram", "गुरुग्राम", "HR", 28.4595, 77.0266),
  c("ghaziabad", "Ghaziabad", "गाज़ियाबाद", "UP", 28.6692, 77.4538),
  c("faridabad", "Faridabad", "फ़रीदाबाद", "HR", 28.4089, 77.3178),
  c("lucknow", "Lucknow", "लखनऊ", "UP", 26.8467, 80.9462),
  c("kanpur", "Kanpur", "कानपुर", "UP", 26.4499, 80.3319),
  c("agra", "Agra", "आगरा", "UP", 27.1767, 78.0081),
  c("varanasi", "Varanasi", "वाराणसी", "UP", 25.3176, 82.9739),
  c("patna", "Patna", "पटना", "BR", 25.5941, 85.1376),
  c("chandigarh", "Chandigarh", "चंडीगढ़", "CH", 30.7333, 76.7794),
  c("ludhiana", "Ludhiana", "लुधियाना", "PB", 30.901, 75.8573),
  c("amritsar", "Amritsar", "अमृतसर", "PB", 31.634, 74.8723),
  c("jaipur", "Jaipur", "जयपुर", "RJ", 26.9124, 75.7873),
  c("kolkata", "Kolkata", "कोलकाता", "WB", 22.5726, 88.3639),
  c("mumbai", "Mumbai", "मुंबई", "MH", 19.076, 72.8777),
  c("pune", "Pune", "पुणे", "MH", 18.5204, 73.8567),
  c("ahmedabad", "Ahmedabad", "अहमदाबाद", "GJ", 23.0225, 72.5714),
  c("bhopal", "Bhopal", "भोपाल", "MP", 23.2599, 77.4126),
  c("indore", "Indore", "इंदौर", "MP", 22.7196, 75.8577),
  c("hyderabad", "Hyderabad", "हैदराबाद", "TG", 17.385, 78.4867),
  c("bengaluru", "Bengaluru", "बेंगलुरु", "KA", 12.9716, 77.5946),
  c("chennai", "Chennai", "चेन्नई", "TN", 13.0827, 80.2707),
  c("guwahati", "Guwahati", "गुवाहाटी", "AS", 26.1445, 91.7362),
  c("bhubaneswar", "Bhubaneswar", "भुवनेश्वर", "OD", 20.2961, 85.8245),
  c("thiruvananthapuram", "Thiruvananthapuram", "तिरुवनंतपुरम", "KL", 8.5241, 76.9366),
];

export const findCity = (id: string): City | undefined => CITIES.find((x) => x.id === id);
