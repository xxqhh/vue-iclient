import { geti18n } from '../_lang';

export default class RestParameter {
  constructor(options) {
    this.url = options.url;
    this.type = 'rest';
    this.attributeFilter = options.attributeFilter || null;
    this.maxFeatures = options.maxFeatures || 20;
    this.name = options.name || geti18n().t('commontypes.restData');
    this.proxy = options.proxy;
  }
}
