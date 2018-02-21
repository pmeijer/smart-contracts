/*globals define*/
/*eslint-env node, browser*/

/**
 * Generated by PluginGenerator 2.16.0 from webgme on Sun Feb 11 2018 14:52:22 GMT-0600 (CST).
 * A plugin that inherits from the PluginBase. To see source code documentation about available
 * properties and methods visit %host%/docs/source/PluginBase.html.
 */

define([
    'plugin/PluginConfig',
    'text!./metadata.json',
    'plugin/PluginBase',
    'common/util/ejs',
    'scsrc/util/utils',
    'scsrc/templatesForBIP/ejsCache',
    'scsrc/parsers/solidity',
    'common/util/guid'
], function (
    PluginConfig,
    pluginMetadata,
    PluginBase,
    ejs,
    utils,
    ejsCache,
    solidity,
    guid) {
    'use strict';

    pluginMetadata = JSON.parse(pluginMetadata);

    /**
     * Initializes a new instance of VerifyContract.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin VerifyContract.
     * @constructor
     */
    var VerifyContract = function () {
        // Call base class' constructor.
        PluginBase.call(this);
        this.pluginMetadata = pluginMetadata;
    };

    /**
     * Metadata associated with the plugin. Contains id, name, version, description, icon, configStructue etc.
     * This is also available at the instance at this.pluginMetadata.
     * @type {object}
     */
    VerifyContract.metadata = pluginMetadata;

    // Prototypical inheritance from PluginBase.
    VerifyContract.prototype = Object.create(PluginBase.prototype);
    VerifyContract.prototype.constructor = VerifyContract;

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - Always log with the provided logger.[error,warning,info,debug].
     * - Do NOT put any user interaction logic UI, etc. inside this method.
     * - callback always has to be called even if error happened.
     *
     * @param {function(string, plugin.PluginResult)} callback - the result callback
     */
    VerifyContract.prototype.main = function (callback) {
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this,
            path,
            fs,
            bipModel,
            filesToAdd = {},
            artifact,
            nodeObject;

        if (typeof window === 'undefined') {
          path = process.cwd();
          fs = require('fs');
          if (!fs.existsSync('projectOutputs')) {
            fs.mkdirSync('projectOutputs');
          }
          path += '/projectOutputs/' + self.core.getAttribute(self.activeNode, 'name') + guid();
          path = path.replace(/\s+/g, '');
        }

        self.loadNodeMap(self.activeNode)
          .then(function (nodes) {
            return VerifyContract.getVerificationResults(self, nodes, self.activeNode, fs, path);
        }). then(function () {
          filesToAdd['output.text'] = fs.readFileSync(path +'/output.txt','utf8');
          artifact = self.blobClient.createArtifact('VerificationOutput');
          return artifact.addFiles(filesToAdd);
            })
            .then(function (fileHash) {
                self.result.addArtifact(fileHash);
                return artifact.save();
            })
            .then(function () {
                self.result.setSuccess(true);
                callback(null, self.result);
            })
            .catch(function (err) {
                self.logger.error(err.stack);
                // Result success is false at invocation.
                callback(err, self.result);
            });

    };

    VerifyContract.getVerificationResults = function (self, nodes, activeNode, fs, path, callback) {
        var contract;
        //console.log('getVerificationResults');
        for (contract of VerifyContract.prototype.getContractPaths.call(self, nodes))
          VerifyContract.prototype.verifyContract.call(self, nodes, contract, fs, path);
    };

  VerifyContract.prototype.verifyContract = function (nodes, contract, fs, path) {
    var self = this,
        core = self.core,
        runbip2smv ='',
        runNusmv = '',
        execSync,
        file,
        node,
        name,
        childPath,
        child,
        childName,
        pathToName = {},
        states = [],
        initialState,
        finalStates = [],
        transitions = [],
        properties = [],
        bipTransitionsToSMVNames = {},
        bipTransitionToSMVName,
        propertiesSMV='', property,
        transition, action, clause,
        inINVAR = false, inModuleMain = false,
        currentConfig = this.getCurrentConfig(),
        model, bipModel, runbip2smv, child;

    //console.log('verifyContract');
    node = nodes[contract];
    name = self.core.getAttribute(node, 'name');

    for (childPath of  self.core.getChildrenPaths(node))
      pathToName[childPath] = self.core.getAttribute(nodes[childPath], 'name');

    for (childPath of self.core.getChildrenPaths(node)) {
      child = nodes[childPath];
      childName = self.core.getAttribute(child, 'name');

      if (self.isMetaTypeOf(child, self.META.State))
        states.push(childName);
      else if (self.isMetaTypeOf(child, self.META.InitialState)) {
        states.push(childName);
        initialState = childName;
      }
      else if (self.isMetaTypeOf(child, self.META.FinalState)) {
        states.push(childName);
        finalStates.push(childName);
      }
      else if (self.isMetaTypeOf(child, self.META.Transition)) {
        transition = {
          'name': childName,
          'src': pathToName[core.getPointerPath(child, 'src')],
          'dst': pathToName[core.getPointerPath(child, 'dst')],
          'guards': core.getAttribute(child, 'guards'),
          'input': core.getAttribute(child, 'input'),
          'output': core.getAttribute(child, 'output'),
          'statements': core.getAttribute(child, 'statements'),
          'tags': core.getAttribute(child, 'tags')
        };
        transitions.push(transition);
      }
    }

    model = {
      'name': name,
      'states': states,
      'transitions': transitions,
      'initialState': initialState,
      'finalStates': finalStates,
      'initialAction': self.core.getAttribute(node, 'initialAction'),
      'fallbackAction': self.core.getAttribute(node, 'fallbackAction')
    };

    model = VerifyContract.prototype.conformance.call(self, model);
    model = VerifyContract.prototype.augmentModel.call(self, model);

    // test strings
    // type1properties = "bid#close; cancelABB|cancelRB#finish"
    // type2properties = "finish#close"
    // type3properties = "withdraw.msg.sender.transfer(amount) # withdraw.msg.sender.transfer(amount) # withdraw.pendingReturns[msg.sender]=0"
    // type4properties = "withdraw.pendingReturns[msg.sender]=0 # withdraw.msg.sender.transfer(amount)"
    //
    // VerifyContract.prototype.parseProperties.call(self, model, type1properties);
    // VerifyContract.prototype.parseProperties.call(self, model, type2properties);
    // VerifyContract.prototype.parseProperties.call(self, model, type3properties);
    // VerifyContract.prototype.parseProperties.call(self, model, type4properties);

    bipModel = ejs.render(ejsCache.contractType.complete, model);

    execSync = require('child_process').execSync;
    if (fs && path) {
          try {
              fs.statSync(path);
          } catch (err) {
              if (err.code === 'ENOENT') {
                  fs.mkdirSync(path);
              }
          }
          fs.writeFileSync(path + '/' + model.name+ '.bip', bipModel, 'utf8');
          runbip2smv = 'java -jar '+ process.cwd() + '/verificationTools/bip-to-nusmv.jar ' + path + '/' +   model.name + '.bip ' + path + '/' + model.name+ '.smv';

          fs.writeFileSync(path + '/runbip2smv.sh', runbip2smv, 'utf8');
          self.sendNotification('Starting the BIP to NuSMV translation..');
          try {
              child = execSync('/bin/bash ' + path + '/runbip2smv.sh');
          } catch (e) {
              self.logger.error('stderr ' + e.stderr);
              throw e;
          }
          self.sendNotification('BIP to NuSMV translation successful.');

          var lineReader = require('readline').createInterface({
            input: fs.createReadStream(path + '/' + model.name+ '.smv')
          });
          
          lineReader.on('line', function (line) {
            if (line.includes("INVAR") && inModuleMain){
              inINVAR = true;
            }
            else if (line.includes("MODULE main")){
              inModuleMain = true;
            }
            else if (inModuleMain && inINVAR){
              if (line.includes("Nu")) {
                var fields = line.split(/\(|\)/);
                bipTransitionsToSMVNames[fields[10].substring(5)] = "(NuInteraction) = (" + fields[6] + ")";
              }
            }
          });  
          
          // temporary code that we might use
          var actionNamesToTransitionNames = {};
          for (transition of model['transitions'])
            if (transition['actionName'] != undefined)
              actionNamesToTransitionNames[transition['actionName'].replace(/\s/g, "")] = transition['name'];
          console.log(actionNamesToTransitionNames);

          /* Get the properties specified by the user  */
          //Template one
          if(currentConfig['templateOne']!=''){
            properties =VerifyContract.prototype.parseProperties.call(self, model, currentConfig['templateOne']);
            //console.log(properties);
            for (property of properties){
              //console.log(property);
              propertiesSMV += '-- AG ( ';
              for (clause of property[0]){
                propertiesSMV += clause + "|"
              }
                propertiesSMV = propertiesSMV.slice(0,-1);
                propertiesSMV += ' -> AG (!(';
                for (clause of property[1]){
                  propertiesSMV += clause + "|"
                }
                propertiesSMV = propertiesSMV.slice(0,-1);
                propertiesSMV += ')))\n';
                  console.log(propertiesSMV);
            }
          }

          //Template two
          if(currentConfig['templateTwo']!=''){
            properties =VerifyContract.prototype.parseProperties.call(self, model, currentConfig['templateTwo']);
            //console.log(properties);
            for (property of properties){
              //console.log(property);
              propertiesSMV += '-- A ( !(';
              for (clause of property[0]){
                propertiesSMV += clause + "|"
              }
                propertiesSMV = propertiesSMV.slice(0,-1);
                propertiesSMV += ') W (';
                for (clause of property[1]){
                  propertiesSMV += clause + "|"
                }
                propertiesSMV = propertiesSMV.slice(0,-1);
                propertiesSMV += '))\n';
                  console.log(propertiesSMV);
            }
          }

          //Template three
          if(currentConfig['templateThree']!=''){
            properties =VerifyContract.prototype.parseProperties.call(self, model, currentConfig['templateThree']);
            //console.log(properties);
            for (property of properties){
              //console.log(property);
              propertiesSMV += '-- AG (()';
              for (clause of property[0]){
                propertiesSMV += clause + "|"
              }
                propertiesSMV = propertiesSMV.slice(0,-1);
                propertiesSMV += ') -> AF (';
                for (clause of property[1]){
                  propertiesSMV += clause + "|"
                }
                propertiesSMV = propertiesSMV.slice(0,-1);
                propertiesSMV += '))\n';
                  console.log(propertiesSMV);
            }
          }

          //Template four
          if(currentConfig['templateFour']!=''){
            properties =VerifyContract.prototype.parseProperties.call(self, model, currentConfig['templateFour']);
            for (property of properties){
              propertiesSMV += '-- AG (';
              for (clause of property[0]){
                propertiesSMV += clause + "|"
              }
                propertiesSMV = propertiesSMV.slice(0,-1);
                propertiesSMV += ') -> AX A [ !(';
                for (clause of property[1]){
                  propertiesSMV += clause + "|"
                }
                propertiesSMV = propertiesSMV.slice(0,-1);
                propertiesSMV += ') W (';
                for (clause of property[2]){
                  propertiesSMV += clause + "|"
                }
                propertiesSMV = propertiesSMV.slice(0,-1);
                propertiesSMV += ')]\n';
                  console.log(propertiesSMV);
            }
          }

          runNusmv = '.' + '/verificationTools/nuXmv -r ' + path + '/' + model.name+ '.smv >> ' + path + '/output.txt';

          fs.writeFileSync(path + '/runNusmv.sh', runNusmv, 'utf8');
          self.sendNotification('Starting the NuSMV verification..');
          try {
              child = execSync('/bin/bash ' + path + '/runNusmv.sh');
          } catch (e) {
              self.logger.error('stderr ' + e.stderr);
              throw e;
          }
          self.sendNotification('NuSMV verification successful.');
      }

  }

  VerifyContract.prototype.parseProperties = function (model, properties) {
    var self = this,
        parsedProperties, clauses, actions,
        property, clause, action, actionName,
        transitions, transition;

    parsedProperties = [];
    for (property of properties.split(";")) {
      clauses = []; // collect all clauses for this property
      for (clause of property.split("#")) {
        actions = []; // collect all actions for this clause
        for (action of clause.split("|")) {
          actionName = action.replace(/\s/g, ""); // all comparisons will be whitespace-agnostic
          transitions = [];
          for (transition of model["transitions"]) { // for each transition, check if it matches the action specification
            //console.log(transition['actionName']);
            if (transition['actionName'] != undefined && transition['actionName'].replace(/\s/g, "") === actionName) {
              transitions.push(transition['actionName']);
            }
          }
          if (transitions.length != 1) // action specification is ambiguous since multiple transitions match it
            throw "Ambiguous action: " + action;
          actions.push(transitions[0]); // single transition matches the action specification
        }
        clauses.push(actions); // push this clause
      }
      parsedProperties.push(clauses); // push this property
    }
    return parsedProperties;
  }

  VerifyContract.prototype.conformance = function (model) {
    var self = this,
        state,
        transition,
        states = [],
        transitions = [],
        initialState = model['initialState'];

    for (state of model['states']) {
      states.push(state);
      if (model['fallbackAction'].trim().length != 0) {
        transitions.push({
          'name': state + "_fallback",
          'src': state,
          'dst': state,
          'guards': "",
          'input': "",
          'output': "",
          'statements': model['fallbackAction'],
          'tags': "payable" // TODO: check if this is the correct syntax for tags!
        });
      }
    }

    for (transition of model['transitions'])
      transitions.push(transition);

    if (model['initialAction'].trim().length != 0) {
      states.push("pre_constructor");
      initialState = "pre_constructor";
      transitions.push({
        'name': model['name'],
        'src': "pre_constructor",
        'dst': model['initialState'],
        'guards': "",
        'input': "",
        'output': "",
        'statements': model['initialAction'],
        'tags': ""
      });
    }

    return {
      'name': model['name'],
      'states': states,
      'transitions': transitions,
      'initialState': initialState,
      'finalStates': model['finalStates']
    };
  }

  VerifyContract.prototype.augmentModel = function (model) {
    var self = this,
        regexpTransfer = /\.\s*transfer\s*\(/,
        state,
        transition,
        augmentedStates = [],
        augmentedTransitions = [];

    for (state of model['states'])
      augmentedStates.push(state);

    for (transition of model['transitions']) {
      augmentedStates.push(transition['name']);
      augmentedTransitions.push({
        'name': "a" + transition['name'] + '_guard',
        'actionName': transition['name'],
        'src': transition['src'],
        'dst': transition['name'],
        'guards': transition['guards'],
        'input': transition['input'],
        'output': transition['output'],
        'statements': "",
        'tags': transition['tags']
      });

      if (!regexpTransfer.test(transition['statements'])) // TODO: if statements cannot raise exception
        VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
          "{" + transition['statements'] + "}", transition['name'], transition['dst'], transition['dst'], transition['name']);
      else {
        augmentedTransitions.push({
          'name': "a" + transition['name'] + '_revert',
          'src': transition['name'],
          'dst': transition['src'],
          'guards': "revert", // TODO: this needs to be a special value
          'input': "",
          'output': "",
          'statements': "",
          'tags': ""
        });
        augmentedStates.push(transition['name'] + "_no_revert");
        augmentedTransitions.push({
          'name': "a" + transition['name'] + '_no_revert',
          'src': transition['name'],
          'dst': transition['name'] + '_no_revert',
          'guards': "no revert", // TODO: this needs to be a special value
          'input': "",
          'output': "",
          'statements': "",
          'tags': ""
        });
        VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
          "{" + transition['statements'] + "}", transition['name'] + '_no_revert', transition['dst'], transition['dst'], transition['name']);
      }
    }

    return {
      'name': model['name'],
      'states': augmentedStates,
      'transitions': augmentedTransitions,
      'initialState': model['initialState'],
      'finalStates': model['finalStates']
    };
  }

  VerifyContract.prototype.augmentStatement = function (augmentedStates, augmentedTransitions, statement, src, dst, ret, originalName) {
    var self = this,
        code,
        parsed,
        body,
        parsedStatement,
        i,
        state,
        condition;

//    statement = "for (uint i = 0; i < 10; i++) msg.sender.transfer(10);";
//    statement = "if (1 == 1) msg.sender.transfer(10);";

    if (!(statement.trim().endsWith("}") || statement.trim().endsWith(";") || (statement.trim().length == 0)))
      statement = statement + ";";
    code = "contract Contract { function Function() { " + statement + " } } ";
    parsed = solidity.parse(code);
    body = parsed["body"][0]["body"][0]["body"]["body"];

    if (body.length == 0) { // empty action
      augmentedTransitions.push({
        'name': "a" + augmentedTransitions.length.toString(),
        'src': src,
        'dst': dst,
        'guards': "",
        'input': "",
        'output': "",
        'statements': "",
        'tags': ""
      });
    }
    else {
      parsedStatement = body[0];

      if (parsedStatement["type"] == "BlockStatement") { // compound statement
        body = parsedStatement["body"];
        if (body.length > 1) {
          state = "s"+augmentedStates.length.toString();
          for (i = 1; i < body.length; i++)
            augmentedStates.push(state + "_" + i);
          VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
            code.substring(body[0]['start'], body[0]['end']), src, state + "_1", ret, originalName);
          for (i = 1; i < body.length - 1; i++)
            VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
              code.substring(body[i]['start'], body[i]['end']), state + "_" + i, state + "_" + (i + 1), ret, originalName);
          VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
            code.substring(body[body.length - 1]['start'], body[body.length - 1]['end']), state + "_" + (body.length - 1), dst, ret, originalName);
        }
        else if (body.length == 1) {
          VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
            code.substring(body[0]['start'], body[0]['end']), src, dst, ret, originalName);
        }
        else {
          augmentedTransitions.push({
            'name': "a" + augmentedTransitions.length.toString(),
            'src': src,
            'dst': dst,
            'guards': "",
            'input': "",
            'output': "",
            'statements': "",
            'tags': ""
          });
        }
      }
      else if ((parsedStatement["type"] == "ExpressionStatement") || (parsedStatement["type"] == "VariableDeclaration") || (parsedStatement["type"] == "VariableDeclarationTuple")) {
        augmentedTransitions.push({
          'name': "a" + augmentedTransitions.length.toString(),
          'actionName': originalName + "." + statement,
          'src': src,
          'dst': dst,
          'guards': "",
          'input': "",
          'output': "",
          'statements': statement,
          'tags': ""
        });
      }
      else if (parsedStatement["type"] == "ReturnStatement") {
        augmentedTransitions.push({
          'name': "a" + augmentedTransitions.length.toString(),
          'actionName': originalName + "." + statement,
          'src': src,
          'dst': ret,
          'guards': "",
          'input': "",
          'output': "",
          'statements': statement,
          'tags': ""
        });
      }
      else if (parsedStatement["type"] == "IfStatement") {
        condition = code.substring(parsedStatement["test"]["start"], parsedStatement["test"]["end"]);
        state = "s" + augmentedStates.length.toString();
        // true branch
        augmentedStates.push(state + "_T");
        augmentedTransitions.push({
          'name': "a" + augmentedTransitions.length.toString(),
          'src': src,
          'dst': state + "_T",
          'guards': condition,
          'input': "",
          'output': "",
          'statements': "",
          'tags': ""
        });
        VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
          code.substring(parsedStatement["consequent"]["start"], parsedStatement["consequent"]["end"]), state + "_T", dst, ret, originalName);
        if (parsedStatement["alternate"] == null) { // no false branch
          augmentedTransitions.push({
            'name': "a" + augmentedTransitions.length.toString(),
            'src': src,
            'dst': dst,
            'guards': "!(" + condition + ")",
            'input': "",
            'output': "",
            'statements': "",
            'tags': ""
          });
        }
        else { // false branch
          augmentedStates.push(state + "_F");
          augmentedTransitions.push({
            'name': "a" + augmentedTransitions.length.toString(),
            'src': src,
            'dst': state + "_F",
            'guards': "!(" + condition + ")",
            'input': "",
            'output': "",
            'statements': "",
            'tags': ""
          });
          VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
            code.substring(parsedStatement["alternate"]["start"], parsedStatement["alternate"]["end"]), state + "_F", dst, ret, originalName);
        }
      }
      else if (parsedStatement["type"] == "ForStatement") {
        state = "s" + augmentedStates.length.toString();
        condition = code.substring(parsedStatement["test"]["start"], parsedStatement["test"]["end"]);
        augmentedStates.push(state + "_I");
        augmentedStates.push(state + "_C");
        augmentedStates.push(state + "_B");
        VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
          code.substring(parsedStatement["init"]["start"], parsedStatement["init"]["end"]), src, state + "_I", ret, originalName);
        augmentedTransitions.push({
          'name': "a" + augmentedTransitions.length.toString(),
          'src': state + "_I",
          'dst': dst,
          'guards': "!(" + condition + ")",
          'input': "",
          'output': "",
          'statements': "",
          'tags': ""
        });
        augmentedTransitions.push({
          'name': "a" + augmentedTransitions.length.toString(),
          'src': state + "_I",
          'dst': state + "_C",
          'guards': condition,
          'input': "",
          'output': "",
          'statements': "",
          'tags': ""
        });
        VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
          code.substring(parsedStatement["body"]["start"], parsedStatement["body"]["end"]), state + "_C", state + "_B", ret, originalName);
        VerifyContract.prototype.augmentStatement.call(self, augmentedStates, augmentedTransitions,
          code.substring(parsedStatement["update"]["start"], parsedStatement["update"]["end"]), state + "_B", state + "_I", ret, originalName);
      }
      else throw "Unsupported statement type!";
    }
  }

  VerifyContract.prototype.getContractPaths = function (nodes) {
    var self = this,
            path,
            node,
            //Using an array for the multiple contracts extention
            contracts = [];

        for (path in nodes) {
            node = nodes[path];
            if (self.isMetaTypeOf(node, self.META.Contract)) {
                contracts.push(path);
            }
        }
        return contracts;
    };


    return VerifyContract;
});
