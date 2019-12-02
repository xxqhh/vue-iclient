// eslint-disable-next-line
import mapboxgl from '../../../static/libs/mapboxgl/mapbox-gl-enhance';
import '../../../static/libs/iclient-mapboxgl/iclient-mapboxgl.min';
import { Events } from '../_types/event/Events';
import epsgCodes from '../web-map/config/epsg.json';
import proj4 from 'proj4';

/**
 * @class iServerRestService
 * @classdesc iServer 数据请求类。
 * @category  BaseTypes Util
 * @param {string} url - iServer 数据服务或地图服务地址。
 * @fires iServerRestService#getdatasucceeded
 * @fires iServerRestService#getdatafailed
 * @fires iServerRestService#featureisempty
 */
export default class iServerRestService extends Events {
  constructor(url, options) {
    super();
    this.url = url;
    this.options = options || {};
    this.eventTypes = ['getdatasucceeded', 'getdatafailed', 'featureisempty'];
  }

  getData(datasetInfo, queryInfo) {
    if (!this._checkUrl(this.url)) {
      return null;
    }
    this._getDatasetInfoSucceed(datasetInfo, queryInfo);
  }
  /**
   * @function iServerRestService.prototype.getData
   * @description 请求数据。
   * @param {Object} queryInfo - 可选参数。
   * @param {Object} [queryInfo.maxFeatures] - 最多可返回的要素数量。
   * @param {Object} [queryInfo.attributeFilter] - 属性过滤条件。
   * @param {Object} [queryInfo.keyWord] - 筛选关键字。
   */
  _getDatasetInfoSucceed(datasetInfo, queryInfo) {
    datasetInfo.dataUrl = this.url;
    // 判断服务为地图服务 或者 数据服务
    this.url.indexOf('/rest/maps') > -1 && this.getMapFeatures(datasetInfo, queryInfo);
    this.url.indexOf('/rest/data') > -1 && this.getDataFeatures(datasetInfo, queryInfo);
  }

  /**
   * @function iServerRestService.prototype.getMapFeatures
   * @description 请求地图服务数据。
   * @param {Object} datasetInfo - 数据集参数。
   * @param {Object} datasetInfo.dataUrl - 地图服务地址。
   * @param {Object} datasetInfo.mapName - 图层名。
   * @param {Object} queryInfo - 可选参数。
   * @param {Object} [queryInfo.maxFeatures] - 最多可返回的要素数量。
   * @param {Object} [queryInfo.attributeFilter] - 属性过滤条件。
   * @param {Object} [queryInfo.keyWord] - 筛选关键字。
   */
  getMapFeatures(datasetInfo, queryInfo) {
    let { dataUrl, mapName } = datasetInfo;
    queryInfo.name = mapName;
    this.projectionUrl = `${dataUrl}/prjCoordSys`;
    if (queryInfo.keyWord) {
      this._getRestMapFields(dataUrl, mapName, fields => {
        queryInfo.attributeFilter = this._getAttributeFilterByKeywords(fields, queryInfo.keyWord);
        this._getMapFeatureBySql(dataUrl, queryInfo);
      });
    } else {
      this._getMapFeatureBySql(dataUrl, queryInfo);
    }
  }
  /**
   * @function iServerRestService.prototype.getDataFeatures
   * @description 请求数据服务数据。
   * @param {Object} datasetInfo - 数据集参数。
   * @param {Object} datasetInfo.datasetName - 数据集名。
   * @param {Object} datasetInfo.dataSourceName - 数据源名。
   * @param {Object} datasetInfo.dataUrl - 数据服务地址。
   * @param {Object} queryInfo - 可选参数。
   * @param {Object} [queryInfo.maxFeatures] - 最多可返回的要素数量。
   * @param {Object} [queryInfo.attributeFilter] - 属性过滤条件。
   * @param {Object} [queryInfo.keyWord] - 筛选关键字。
   */
  getDataFeatures(datasetInfo, queryInfo) {
    let { datasetName, dataSourceName, dataUrl } = datasetInfo;
    queryInfo.name = datasetName + '@' + dataSourceName;
    queryInfo.datasetNames = [dataSourceName + ':' + datasetName];
    this.projectionUrl = `${dataUrl}/datasources/${dataSourceName}/datasets/${datasetName}`;
    if (queryInfo.keyWord) {
      let fieldsUrl = dataUrl + `/datasources/${dataSourceName}/datasets/${datasetName}/fields.rjson`;
      this._getRestDataFields(fieldsUrl, fields => {
        queryInfo.attributeFilter = this._getAttributeFilterByKeywords(fields, queryInfo.keyWord);
        this._getDataFeaturesBySql(dataUrl, queryInfo);
      });
    } else {
      this._getDataFeaturesBySql(dataUrl, queryInfo);
    }
  }
  _getMapFeatureBySql(url, queryInfo) {
    let queryBySQLParams, queryBySQLService;
    queryBySQLParams = new SuperMap.QueryBySQLParameters({
      queryParams: [
        {
          name: queryInfo.name,
          attributeFilter: queryInfo.attributeFilter
        }
      ],
      expectCount: queryInfo.maxFeatures
    });
    queryBySQLService = new SuperMap.QueryBySQLService(url, {
      proxy: this.options.proxy,
      eventListeners: {
        processCompleted: this._getFeaturesSucceed.bind(this),
        processFailed: function() {}
      }
    });
    queryBySQLService.processAsync(queryBySQLParams);
  }
  _getDataFeaturesBySql(url, queryInfo) {
    let getFeatureBySQLParams, getFeatureBySQLService;
    getFeatureBySQLParams = new SuperMap.GetFeaturesBySQLParameters({
      queryParameter: {
        name: queryInfo.name,
        attributeFilter: queryInfo.attributeFilter
      },
      datasetNames: queryInfo.datasetNames,
      fromIndex: 0,
      toIndex: queryInfo.maxFeatures >= 1000 ? -1 : queryInfo.maxFeatures - 1,
      maxFeatures: -1
    });
    getFeatureBySQLService = new SuperMap.GetFeaturesBySQLService(url, {
      proxy: this.options.proxy,
      eventListeners: {
        processCompleted: this._getFeaturesSucceed.bind(this),
        processFailed: function() {}
      }
    });
    getFeatureBySQLService.processAsync(getFeatureBySQLParams);
  }

  async _getFeaturesSucceed(results) {
    let features;
    let fieldCaptions;
    let fieldTypes;

    if (results.result && results.result.recordsets) {
      // 数据来自restmap
      const recordsets = results.result.recordsets[0];
      this.features = recordsets.features;
      features = this.features.features;
      if (features && features.length > 0) {
        fieldCaptions = recordsets.fields;
        fieldTypes = recordsets.fieldTypes;
      } else {
        /**
         * @event iServerRestService#featureisempty
         * @description 请求数据为空后触发。
         * @property {Object} e  - 事件对象。
         */
        this.triggerEvent('featureisempty', {
          results
        });
        return;
      }
    } else if (results.result) {
      // 数据来自restdata---results.result.features
      this.features = results.result.features;
      features = this.features.features;
      fieldCaptions = [];
      fieldTypes = [];
      if (features && features.length > 0) {
        const feature = this.features.features[0];
        // 获取每个字段的名字和类型
        for (let attr in feature.properties) {
          fieldCaptions.push(attr);
          fieldTypes.push(this._getDataType(feature.properties[attr]));
        }
      } else {
        this.triggerEvent('featureisempty', {
          results
        });
        return;
      }
    } else {
      this.triggerEvent('getdatafailed', {
        results
      });
      return;
    }
    const data = {
      features,
      fieldCaptions,
      fieldTypes,
      fieldValues: []
    };
    for (let m in fieldCaptions) {
      const fieldValue = [];
      for (let j in features) {
        const feature = features[j];
        const caption = data.fieldCaptions[m];
        const value = feature.properties[caption];
        fieldValue.push(value);
      }
      // fieldValues   [[每个字段的所有要素值],[],[]]
      data.fieldValues.push(fieldValue);
    }
    // this.getDataSucceedCallback && this.getDataSucceedCallback(data);
    const epsgCode = await this._getEpsgCode();
    if (epsgCode) {
      const projName = this._getValueOfEpsgCode(epsgCode);
      data.features = features.map(feature => {
        const coordinates = feature.geometry.coordinates;
        feature.geometry.coordinates = this._transformCoordinates(coordinates, projName);
        return feature;
      });
    }
    /**
     * @event iServerRestService#getdatasucceeded
     * @description 请求数据成功后触发。
     * @property {Object} e  - 事件对象。
     */
    this.triggerEvent('getdatasucceeded', data);
  }

  _getRestDataFields(fieldsUrl, callBack) {
    SuperMap.FetchRequest.get(fieldsUrl, null, { proxy: this.options.proxy })
      .then(response => {
        return response.json();
      })
      .then(results => {
        let fields = results.fieldNames;
        callBack(fields, results);
      })
      .catch(error => {
        console.log(error);
      });
  }
  _getRestMapFields(url, layerName, callBack) {
    let param = new SuperMap.QueryBySQLParameters({
      queryParams: [
        new SuperMap.FilterParameter({
          name: layerName,
          attributeFilter: 'SMID=0'
        })
      ]
    });
    const queryBySQLSerice = new SuperMap.QueryBySQLService(url, {
      proxy: this.options.proxy,
      eventListeners: {
        processCompleted: serviceResult => {
          let fields;
          serviceResult.result && (fields = serviceResult.result.recordsets[0].fieldCaptions);
          fields && callBack(fields, serviceResult.result.recordsets[0]);
        },
        processFailed: serviceResult => {
          callBack(serviceResult);
        }
      }
    });
    queryBySQLSerice.processAsync(param);
  }
  _getAttributeFilterByKeywords(fields, keyWord) {
    let attributeFilter = '';
    fields.forEach((field, index) => {
      attributeFilter +=
        index !== fields.length - 1 ? `${field} LIKE '%${keyWord}%' ` + 'OR ' : `${field} LIKE '%${keyWord}%'`;
    }, this);
    return attributeFilter;
  }
  /**
   * @function iServerRestService.prototype._checkUrl
   * @description 检查url是否符合要求
   * @private
   * @param {string} url
   */
  _checkUrl(url) {
    let match;
    if (url === '' || !this._isMatchUrl(url)) {
      match = false;
    } else {
      match = true;
    }
    // else if (/^http[s]?:\/\/localhost/.test(url) || /^http[s]?:\/\/127.0.0.1/.test(url)) {
    //     //不是实际域名
    //     match = false;
    // }
    return match;
  }

  /**
   * @function iServerRestService.prototype._isMatchUrl
   * @description 判断输入的地址是否符合地址格式
   * @private
   * @param {string} str - url
   */
  _isMatchUrl(str) {
    var reg = new RegExp('(https?|http|file|ftp)://[-A-Za-z0-9+&@#/%?=~_|!:,.;]+[-A-Za-z0-9+&@#/%=~_|]');
    return reg.test(str);
  }
  /**
     /**
   * @function ChartViewModel.prototype._isDate
   * @description 判断是否为日期
   * @private
   * @param {string} data - 字符串
   */
  _isDate(data) {
    let reg = /((^((1[8-9]\d{2})|([2-9]\d{3}))([-\/\._])(10|12|0?[13578])([-\/\._])(3[01]|[12][0-9]|0?[1-9])$)|(^((1[8-9]\d{2})|([2-9]\d{3}))([-\/\._])(11|0?[469])([-\/\._])(30|[12][0-9]|0?[1-9])$)|(^((1[8-9]\d{2})|([2-9]\d{3}))([-\/\._])(0?2)([-\/\._])(2[0-8]|1[0-9]|0?[1-9])$)|(^([2468][048]00)([-\/\._])(0?2)([-\/\._])(29)$)|(^([3579][26]00)([-\/\._])(0?2)([-\/\._])(29)$)|(^([1][89][0][48])([-\/\._])(0?2)([-\/\._])(29)$)|(^([2-9][0-9][0][48])([-\/\._])(0?2)([-\/\._])(29)$)|(^([1][89][2468][048])([-\/\._])(0?2)([-\/\._])(29)$)|(^([2-9][0-9][2468][048])([-\/\._])(0?2)([-\/\._])(29)$)|(^([1][89][13579][26])([-\/\._])(0?2)([-\/\._])(29)$)|(^([2-9][0-9][13579][26])([-\/\._])(0?2)([-\/\._])(29)$))/gi;
    return reg.test(data);
  }
  /**
   * @function iServerRestService.prototype._getDataType
   * @description 判断数据的类型
   * @private
   * @param {string} data - 字符串
   */
  _getDataType(data) {
    if (data !== null && data !== undefined && data !== '') {
      if (this._isDate(data)) {
        return 'DATE';
      }
      if (this._isNumber(data)) {
        return 'NUMBER';
      }
    }
    return 'STRING';
  }
  /**
   * @function iServerRestService.prototype._isNumber
   * @description 判断是否为数值
   * @private
   * @param {string} data - 字符串
   */
  _isNumber(data) {
    let mdata = Number(data);
    if (mdata === 0) {
      return true;
    }
    return !isNaN(mdata);
  }

  // 转坐标系
  _getEpsgCode() {
    if (!this.projectionUrl) {
      return;
    }
    return SuperMap.FetchRequest.get(this.projectionUrl, null, { proxy: this.options.proxy })
      .then(response => {
        return response.json();
      })
      .then(results => {
        let epsgCode = results.epsgCode;
        if (results.datasetInfo) {
          const { prjCoordSys } = results.datasetInfo;
          epsgCode = prjCoordSys ? prjCoordSys.epsgCode : null;
        }
        return epsgCode;
      })
      .catch(error => {
        console.log(error);
      });
  }

  _getValueOfEpsgCode(epsgCode) {
    const defName = `EPSG:${epsgCode}`;
    proj4.defs(`EPSG:${epsgCode}`, epsgCodes[defName]);
    return defName;
  }

  _transformCoordinates(coordinates, projName) {
    if (coordinates[0] instanceof Array) {
      coordinates.forEach((item, index) => {
        if (item instanceof Array) {
          coordinates[index] = this._transformCoordinates(item, projName);
        }
      });
    } else if (coordinates.length > 0) {
      return projName !== 'EPSG:4326' ? proj4(projName, 'EPSG:4326', coordinates) : coordinates;
    }
    return coordinates;
  }
}