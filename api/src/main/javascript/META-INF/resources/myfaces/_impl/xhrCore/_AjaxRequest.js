/* Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to you under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * An implementation of an xhr request object
 * with partial page submit functionality, and faces
 * ppr request and timeout handling capabilities
 *
 * Author: Werner Punz (latest modification by $Author: ganeshpuri $)
 * Version: $Revision: 1.4 $ $Date: 2009/05/31 09:16:44 $
 */

/**
 * @class
 * @name _AjaxRequest
 * @memberOf myfaces._impl.xhrCore
 * @extends myfaces._impl.core.Object
 */
_MF_CLS(_PFX_XHR + "_AjaxRequest", _MF_OBJECT, /** @lends myfaces._impl.xhrCore._AjaxRequest.prototype */ {

    _contentType: "application/x-www-form-urlencoded",
    /** source element issuing the request */
    _source: null,
    /** context passed down from the caller */
    _context:null,
    /** source form issuing the request */
    _sourceForm: null,
    /** passthrough parameters */
    _passThrough: null,

    /** queue control */
    _timeout: null,
    /** enqueuing delay */
    //_delay:null,
    /** queue size */
    _queueSize:-1,

    /**
     back reference to the xhr queue,
     only set if the object really is queued
     */
    _xhrQueue: null,

    /** pps an array of identifiers which should be part of the submit, the form is ignored */
    _partialIdsArray : null,

    /** xhr object, internal param */
    _xhr: null,

    /** predefined method */
    _ajaxType:"POST",

    //CONSTANTS
    ENCODED_URL:"jakarta.faces.encodedURL",
    /*
     * constants used internally
     */
    _CONTENT_TYPE:"Content-Type",
    _HEAD_FACES_REQ:"Faces-Request",
    _VAL_AJAX: "partial/ajax",
    _XHR_CONST: myfaces._impl.xhrCore.engine.XhrConst,

    // _exception: null,
    // _requestParameters: null,
    /**
     * Constructor
     * <p />
     * note there is a load of common properties
     * inherited by the base class which define the corner
     * parameters and the general internal behavior
     * like _onError etc...
     * @param {Object} args an arguments map which an override any of the given protected
     * instance variables, by a simple name value pair combination
     */
    constructor_: function(args) {

        try {
            this._callSuper("constructor_", args);

            this._initDefaultFinalizableFields();
            delete this._resettableContent["_xhrQueue"];

            this.applyArgs(args);

            /*namespace remapping for readability*/
            //we fetch in the standard arguments
            //and apply them to our protected attributes
            //we do not gc the entry hence it is not defined on top
            var xhrCore = myfaces._impl.xhrCore;
            this._AJAXUTIL = xhrCore._AjaxUtils;

        } catch (e) {
            //_onError
            this._stdErrorHandler(this._xhr, this._context, e);
        }
    },

    /**
     * Sends an Ajax request
     */
    send : function() {

        var _Lang = this._Lang;
        var _RT = this._RT;

        try {

            var scopeThis = _Lang.hitch(this, function(functionName) {
                return _Lang.hitch(this, this[functionName]);
            });
            this._xhr = _Lang.mixMaps(this._getTransport(), {
                onprogress: scopeThis("onprogress"),
                ontimeout:  scopeThis("ontimeout"),
				//remove for xhr level2 support (chrome has problems with it)
                onloadend:  scopeThis("ondone"),
                onload:     scopeThis("onsuccess"),
                onerror:    scopeThis("onerror")

            }, true);
            var xhr = this._xhr,
                    sourceForm = this._sourceForm,
                    targetURL = (typeof sourceForm.elements[this.ENCODED_URL] == 'undefined') ?
                            sourceForm.action :
                            sourceForm.elements[this.ENCODED_URL].value,
                    formData = this.getFormData();

            for (var key in this._passThrough) {
                if(!this._passThrough.hasOwnProperty(key)) continue;
                formData.append(key, this._passThrough[key]);
            }

            xhr.open(this._ajaxType, targetURL +
                    ((this._ajaxType == "GET") ? "?" + this._formDataToURI(formData) : "")
                    , true);

            xhr.timeout = this._timeout || 0;

            this._applyContentType(xhr);
            xhr.setRequestHeader(this._HEAD_FACES_REQ, this._VAL_AJAX);

            //some webkit based mobile browsers do not follow the w3c spec of
            // setting the accept headers automatically
            if(this._RT.browser.isWebKit) {
                xhr.setRequestHeader("Accept","text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8");
            }
            this._sendEvent("BEGIN");
            //Check if it is a custom form data object
            //if yes we use makefinal for the final handling
            if (formData && formData.makeFinal) {
                formData = formData.makeFinal()
            }
            xhr.send((this._ajaxType != "GET") ? formData : null);

        } catch (e) {
            //_onError//_onError
            e = (e._mfInternal)? e: this._Lang.makeException(new Error(), "sendError","sendError", this._nameSpace, "send", e.message);
            this._stdErrorHandler(this._xhr, this._context, e);
        }
    },

    /**
     * helper, in multipart situations we might alter the content type
     * from the urlencoded one
     */
    _applyContentType: function(xhr) {
        var contentType = this._contentType+"; charset=utf-8";

        xhr.setRequestHeader(this._CONTENT_TYPE, contentType);
    },

    ondone: function() {
        this._requestDone();
    },


    onsuccess: function(/*evt*/) {

        var context = this._context;
        var xhr = this._xhr;
        try {
            this._sendEvent("COMPLETE");
            //now we have to reroute into our official api
            //because users might want to decorate it, we will split it apart afterwards

            context._mfInternal = context._mfInternal || {};
            faces.ajax.response((xhr.getXHRObject) ? xhr.getXHRObject() : xhr, context);



        } catch (e) {
            this._stdErrorHandler(this._xhr, this._context, e);
        }
        //add for xhr level2 support
        //}  finally {
        //W3C spec onloadend must be called no matter if success or not
        //    this.ondone();
        //}
    },

    onerror: function(/*evt*/) {
        //TODO improve the error code detection here regarding server errors etc...
        //and push it into our general error handling subframework
        var context = this._context;
        var xhr = this._xhr;
        var _Lang = this._Lang;

        var errorText = "";
        this._sendEvent("COMPLETE");
        try {
            var UNKNOWN = _Lang.getMessage("UNKNOWN");
            //status can be 0 and statusText can be ""
            var status = ('undefined' != xhr.status  && null != xhr.status)? xhr.status : UNKNOWN;
            var statusText = ('undefined' != xhr.statusText  && null != xhr.statusText)? xhr.statusText : UNKNOWN;
            errorText = _Lang.getMessage("ERR_REQU_FAILED", null,status,statusText);

        } catch (e) {
            errorText = _Lang.getMessage("ERR_REQ_FAILED_UNKNOWN", null);
        } finally {
            var _Impl = this.attr("impl");
                _Impl.sendError(xhr, context, _Impl.HTTPERROR,
                _Impl.HTTPERROR, errorText,"","myfaces._impl.xhrCore._AjaxRequest","onerror");
            //add for xhr level2 support
            //since chrome does not call properly the onloadend we have to do it manually
            //to eliminate xhr level1 for the compile profile modern
            //W3C spec onloadend must be called no matter if success or not
            //this.ondone();
        }
        //_onError
    },

    onprogress: function(/*evt*/) {
        //do nothing for now
    },

    ontimeout: function(/*evt*/) {
        try {
            //we issue an event not an error here before killing the xhr process
            this._sendEvent("TIMEOUT_EVENT");
            //timeout done we process the next in the queue
        } finally {
            this._requestDone();
        }
    },

    _formDataToURI: function(formData) {
        if (formData && formData.makeFinal) {
            formData = formData.makeFinal()
        }
        return formData;
    },

    /**
     * change for faces 2.3 since we drop legacy browser support
     * there is no need anymore to support xhr level 1.
     * @returns {XMLHttpRequest} the transport object
     * @private
     */
    _getTransport: function() {
        return new XMLHttpRequest();
    },


    //----------------- backported from the base request --------------------------------
    //non abstract ones


    /**
     * Spec. 13.3.1
     * Collect and encode input elements.
     * Additionally the hidden element jakarta.faces.ViewState
     * Enhancement partial page submit
     *
     * @return  an element of formDataWrapper
     * which keeps the final Send Representation of the
     */
    getFormData : function() {
        var _AJAXUTIL = this._AJAXUTIL, myfacesOptions = this._context.myfaces, ret = null;



        if (!this._partialIdsArray || !this._partialIdsArray.length) {
            var _AJAXUTIL = this._AJAXUTIL, myfacesOptions = this._context.myfaces;
            return this._Lang.createFormDataDecorator(faces.getViewState(this._sourceForm));
        } else {
            //now this is less performant but we have to call it to allow viewstate decoration
            ret = this._Lang.createFormDataDecorator(new Array());
            _AJAXUTIL.encodeSubmittableFields(ret, this._sourceForm, this._partialIdsArray);
            if (this._source && myfacesOptions && myfacesOptions.form)
                _AJAXUTIL.appendIssuingItem(this._source, ret);

        }
        return ret;

    },



    /**
     * Client error handlers which also in the long run route into our error queue
     * but also are able to deliver more meaningful messages
     * note, in case of an error all subsequent xhr requests are dropped
     * to get a clean state on things
     *
     * @param request the xhr request object
     * @param context the context holding all values for further processing
     * @param exception the embedded exception
     */
    _stdErrorHandler: function(request, context, exception) {
        var xhrQueue = this._xhrQueue;
        try {
             this.attr("impl").stdErrorHandler(request, context, exception);
        } finally {
            if (xhrQueue) {
                xhrQueue.cleanup();
            }
        }
    },

    _sendEvent: function(evtType) {
        var _Impl = this.attr("impl");
        _Impl.sendEvent(this._xhr, this._context, _Impl[evtType]);
    },

    _requestDone: function() {
        var queue = this._xhrQueue;
        if (queue) {
            queue.processQueue();
        }
        //ie6 helper cleanup
        delete this._context.source;

    }
});

