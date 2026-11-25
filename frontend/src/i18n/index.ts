import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en.json";
import mr from "./mr.json";
import hi from "./hi.json";
import { isLang, Lang } from "../lib/langs";

const KEY = "jalsetu.lang";

export function savedLang(): Lang {
  const v = localStorage.getItem(KEY);
  return isLang(v) ? v : "en";
}

/** The reader picked a language on this device (it then wins over the one saved with an account). */
export const hasChosenLang = () => isLang(localStorage.getItem(KEY));

export function initLang() {
  const lng = savedLang();
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, mr: { translation: mr }, hi: { translation: hi } },
    lng, fallbackLng: "en", interpolation: { escapeValue: false }, returnNull: false,
  });
  document.documentElement.lang = lng;
}

export function setLang(l: Lang) {
  localStorage.setItem(KEY, l);
  document.documentElement.lang = l;
  void i18n.changeLanguage(l);
}

export default i18n;
