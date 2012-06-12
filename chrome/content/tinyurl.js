var tinyurlgen = {
	
    //Is the current page being processed
    processing : false,
    //The HTTP Request Object
    currentRequest : null,
    //Does the link need to be previewable?
    preview : false,
    // Is this the first time the add-on has been run?
    firstRun : true,
    //TinyURL options
    settings : {
        createpreviewbydefault : false,
        showpageoption : true,
        showlinkoption : true
    },
    //TinyURL localised strings object
    stringsobj : null,
    //20 second timeout for requests
    timeout : 20000,
    //A reference to the object that was context clicked
    contextobj : null,
    //A reference to the clipboard object (don't initialise it right away
    clipboard : null,
	
    //A function to copy the returned URL to the clipboard
    copytoclipboard : function(text){
        
        // If a link to the clipboard has not yet been created...
        if(!tinyurlgen.clipboard)
        {
            // Create a link to the clipboard if required
            tinyurlgen.clipboard = this.cc("@mozilla.org/widget/clipboardhelper;1", "nsIClipboardHelper");
        }
		
        //Copy text to clipboard
        tinyurlgen.clipboard.copyString(text);
    },
	
    //A function to ease Component Class interfacing
    cc : function(cName, ifaceName){
		
        return Components.classes[cName].getService(Components.interfaces[ifaceName]);
    },
	
    cu : function(cName){

        try{
            Components.utils.import(cName);   
        }
        catch(e){
            
        }
    },
    
    init : function(){
        //Get the broswer XUL Object
        var appcontent = document.getElementById("appcontent");   // browser
        //If it exists...
        if(appcontent){
            //Attach a listener that resets the processing state as a new page is loaded
            appcontent.addEventListener("DOMContentLoaded", tinyurlgen.reset, false);
        }
        //Attach listener event to context menu to show and hide menuitem
        var contextMenu = document.getElementById("contentAreaContextMenu");
        if(contextMenu){
            contextMenu.addEventListener("popupshowing", function(){
                var pageoption = document.getElementById('tinyurlgen-context-page-option');
                var linkoption = document.getElementById('tinyurlgen-context-link-option');
                var pagehidden = !tinyurlgen.settings.showpageoption;
                var linkhidden = true;
                var el;
                if(document.popupNode && tinyurlgen.settings.showlinkoption){
                    el = document.popupNode;
                    while(el){
                        if(el.localName && el.localName.toLowerCase() == 'a'){
                            if(el.href != ''){
                                tinyurlgen.contextobj = el;
                                linkhidden = false;
                            }
                            break;
                        }
                        else{
                            el = el.parentNode;
                        }
                    }
                }

                pageoption.hidden = pagehidden;
                linkoption.hidden = linkhidden;
            }, false);
        }

        //Load and apply settings
        tinyurlgen.applysettings();

        const tinyurlTBItem = "tinyurlgen-status-bar-icon";
        
        if(tinyurlgen.firstRun){
            // First run - add icon to addon bar and show it
            setTimeout("tinyurlgen.addicontoaddonbar();", 5);
        }

        var appInfo = tinyurlgen.cc("@mozilla.org/xre/app-info;1", "nsIXULAppInfo");
        tinyurlgen.FFVersion = appInfo.version;
    },
    
    abort : function(){
		
    //Abort current request
    if(tinyurlgen.currentRequest){
        tinyurlgen.currentRequest.abort();
        }
        
    //Set current state (error)
    tinyurlgen.setstate('error');
    setTimeout('tinyurlgen.reset();', 5000);
    },
    
    addicontoaddonbar : function(){

        const addonbarId = "addon-bar";
        const iconId = "tinyurlgen-status-bar-icon";
        
        // Get references to the addon bar and icon
        var addonbar = document.getElementById(addonbarId);
        var icon = document.getElementById(iconId);
        
        // If the addon bar is found, but the icon is not
        if (addonbar && !icon)
        {
            // Add the icon to the toolbar's 'set' property
            var newSet = addonbar.currentSet + "," + iconId;
            addonbar.setAttribute("currentset", newSet);
            addonbar.currentSet = newSet;
            // Make sure the change persists
            document.persist(addonbarId, "currentset");
            // Show the addon bar
            setToolbarVisibility(addonbar, true);
            try {
                BrowserToolboxCustomizeDone(true);
            } catch (e) {}
        }
      
    },
	
    applysettings : function(){
		
        //Load settings from config
        var prefManager = tinyurlgen.cc("@mozilla.org/preferences-service;1", "nsIPrefBranch");
		
        tinyurlgen.settings.createpreviewbydefault = prefManager.getBoolPref("extensions.tinyurlgen.createpreviewbydefault");
        tinyurlgen.settings.showpageoption = prefManager.getBoolPref("extensions.tinyurlgen.showcontextoptionforpage");
        tinyurlgen.settings.showlinkoption = prefManager.getBoolPref("extensions.tinyurlgen.showcontextoptionforlinks");
		
        tinyurlgen.firstRun = prefManager.getBoolPref("extensions.tinyurlgen.firstrun");
        if(tinyurlgen.firstRun){
            prefManager.setBoolPref("extensions.tinyurlgen.firstrun", false);
        }
			
        //Get button references
        var create = document.getElementById('tinyurlgen-button-create');
        var createwithpreview = document.getElementById('tinyurlgen-button-create-with-preview');
        //If Create Previewable link by default...
        if(tinyurlgen.settings.createpreviewbydefault){
            //Set to default
            createwithpreview.setAttribute("default", true);
            //Unset default
            create.setAttribute("default", "false");
            //Move option to top
            createwithpreview.parentNode.insertBefore(createwithpreview, create);
        }
        else{
            //Set to default
            create.setAttribute("default", true);
            //Unset default
            createwithpreview.setAttribute("default", "false");
            //Move option to top
            create.parentNode.insertBefore(create, createwithpreview);
        }
    },
	
    //A function to generate a TinyURL
    generate : function(evt){
		
        //If the page is already being process, end execution
        if(tinyurlgen.processing){
            return false;
        }
			
        if(evt.target.id == 'tinyurlgen-context-link-option'){
            //Get linked page URL
            var url = tinyurlgen.contextobj.href;
            tinyurlgen.contextobj = null;
        }
        else{
            //Get current page URL
            var url = content.document.location.href;
        }
			
        //Encode URL
        url = encodeURIComponent(url);
			
        //Set state to processing
        tinyurlgen.setstate('processing');
		
        //Create HTTP Request Object
        tinyurlgen.currentRequest = new tinyurlgen.request("http://tinyurl.com/api-create.php?url=" + url, tinyurlgen.handleresponse);
        //Send request
        tinyurlgen.currentRequest.get();
        //Set timeout
        setTimeout("tinyurlgen.abort()", tinyurlgen.timeout);
    },

    generateplain : function(evt){

        tinyurlgen.generate(evt);
    },

    generatepreview : function(evt){

        tinyurlgen.preview = true;
        tinyurlgen.generate(evt);	
    },

    generatedefault : function(evt){

        //If the icon was 'right clicked', end execution
        if(evt.button == 2){
            return false;
        }

        //If Create Previewable link by default
        if(tinyurlgen.settings.createpreviewbydefault){
            //Set preview to true
            tinyurlgen.preview = true;
        }
        tinyurlgen.generate(evt);
    },

    getwindow : function(winName){

        return tinyurlgen.cc("@mozilla.org/appshell/window-mediator;1", "nsIWindowMediator").getMostRecentWindow(winName);
    },
	
    handleresponse : function(response){
					
        tinyurlgen.currentRequest = null;
                                        
        //Check that the response is valid
        if(response.match(/http\:\/\/tinyurl.com\//gi)){
            //Is this a previewable link?
            if(tinyurlgen.preview){
                //Make link previewable
                response = response.replace(/http\:\/\/tinyurl.com\//gi, 'http://preview.tinyurl.com/')
            }
            //Set current state (complete)
            tinyurlgen.setstate('complete');
            //Copy URL to clipboard
            tinyurlgen.copytoclipboard(response);
            //Reset state in 5 seconds
            setTimeout('tinyurlgen.reset();', 5000);
        }
        else{
            //Set current state (error)
            tinyurlgen.setstate('error');
            setTimeout('tinyurlgen.reset();', 5000);
        }
    },
	
    reset : function(){
		
        //If a TinyURL is not being generated
        if(!tinyurlgen.processing){
            //Reset the icon
            tinyurlgen.setstate(null);
        }
    },
	
    setstate : function(state){
		
        //Define variables
        var icon;
        var title, src, processing;
			
        //Get relevant titles and icons
        switch(state){
            //TinyURL retrieved successfully
            case 'complete':
                src = 'okay.png';
                title = tinyurlgen.string('state.complete');
                processing = false;
                break;
				
            //Error occurred when retrieving TinyURL
            case 'error':
                src = 'error.png';
                title = tinyurlgen.string('state.error');
                processing = false;
                break;
				
            //Currently retrieving TinyURL
            case 'processing':
                src = 'process.gif';
                title = tinyurlgen.string('state.processing');
                processing = true;
                break;
	
            //Reset to default state
            default:
                src = 'link.png';
                title = tinyurlgen.string('state.default');
                processing = false;
                break;
        }
			
        //Reset processing state
        tinyurlgen.processing = processing;
			
        //If processing complete, reset 'preview' flag
        if(!processing){
            tinyurlgen.preview = false;
        }
			
        //Get icon object
        icon = document.getElementById('tinyurlgen-status-bar-icon');
        if(icon){
            if(icon.nodeName.toLowerCase() == 'toolbarbutton'){
                icon.setAttribute('class', 'toolbarbutton-1 ' + state);
            }
            else{
                icon.setAttribute('src', 'chrome://tinyurlgen/skin/' + src);
            }
            icon.setAttribute('tooltiptext', title);
        }
    },
	
    showoptions : function(){
		
        //Get reference to window object
        var win = tinyurlgen.getwindow("TinyURL:Options");
        //If window is already open...
        if(win){
            //Focus it
            win.focus();
        }
        //If not
        else{
            //Create new dialog window
            var parentWindow = (!window.opener || window.opener.closed) ? window : window.opener;
            parentWindow.openDialog("chrome://tinyurlgen/content/options.xul", "_blank", "resizable=no,dialog=no,centerscreen");
        }
    },
	
    string : function(stringname){
		
        if(!tinyurlgen.stringobj){
            var localeService = this.cc("@mozilla.org/intl/nslocaleservice;1", "nsILocaleService");
            var bundleService = this.cc("@mozilla.org/intl/stringbundle;1", "nsIStringBundleService");
            var appLocale = localeService.getApplicationLocale();
            tinyurlgen.stringobj = bundleService.createBundle("chrome://tinyurlgen/locale/tinyurl.properties", appLocale);
        }
			
        return tinyurlgen.stringobj.GetStringFromName(stringname);
    }
}

//Reset state as new page loads
window.addEventListener('load', tinyurlgen.init, false);