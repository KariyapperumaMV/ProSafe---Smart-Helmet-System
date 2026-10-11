import {
  siArduino, siAxios, siEspressif, siExpress, siFlask, siGithub, siJavascript, siJest, siJson,
  siJsonwebtokens, siMongodb, siMongoose, siNodedotjs, siNumpy, siPandas, siPlatformio, siPython,
  siReact, siReactrouter, siScikitlearn, siTestinglibrary, siVite, siVitest,
} from 'simple-icons';

export const brands = {
  siArduino, siAxios, siEspressif, siExpress, siFlask, siGithub, siJavascript, siJest, siJson,
  siJsonwebtokens, siMongodb, siMongoose, siNodedotjs, siNumpy, siPandas, siPlatformio, siPython,
  siReact, siReactrouter, siScikitlearn, siTestinglibrary, siVite, siVitest,
};

/** Brand marks whose official colour is too dark to read on the dark surface. */
export const lowContrast = new Set(['siExpress', 'siJsonwebtokens', 'siJson', 'siGithub', 'siNumpy', 'siPandas', 'siMongoose', 'siFlask']);

export function hasBrandIcon(name) {
  return Boolean(name && brands[name]);
}
