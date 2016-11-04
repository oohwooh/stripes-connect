import React from 'react';
import _ from 'lodash';
import { connect as reduxConnect } from 'react-redux';
import okapiResource from './okapiResource';
import restResource from './restResource';
import localResource from './localResource';

const defaultType = 'local';
const types = {
  'local': localResource,
  'okapi': okapiResource,
  'rest': restResource
}

// Should be doable with a scalar in a closure, but doesn't work right for some reason.
let module2errorHandler = {};

const wrap = (Wrapped, module) => {
  let resources = [];
  _.forOwn(Wrapped.manifest, (query, name) => {
    if (!name.startsWith('@')) {
      // Regular manifest entries describe resources
      const resource = new types[query.type || defaultType](name, query, module);
      resources.push(resource);
    } else if (name === '@errorHandler') {
      setErrorHandler(query);
    } else {
      console.log("WARNING: " + module + " ignoring unsupported special manifest entry '" + name + "'");
    }
  });

  function setErrorHandler(handler, force) {
    console.log("setErrorHandler(" + module + ", force=" + force, " +", handler, "):",
                "existing errorHandler = ", module2errorHandler[module]);
    if (force || !module2errorHandler[module]) {
      module2errorHandler[module] = handler;
      console.log("setErrorHandler(" + module + "): set new errorHandler");
    } else {
      console.log("setErrorHandler(" + module + "): not overriding existing errorHandler");
    }
  }


  class Wrapper extends React.Component {
    constructor(props, context) {
      super();
      if (!(context.addReducer)) {
        throw new Error("No addReducer function available in component context");
      }
      resources.forEach(resource => {
        context.addReducer(resource.stateKey(), resource.reducer);
      });
      context.addReducer('@@error', this.errorReducer.bind(this));
      setErrorHandler(this.naiveErrorHandler, false);
    }

    errorReducer(state = [], action) {
      // Handle error actions. I'm not sure how I feel about dispatching
      // from a reducer, but it's the only point of universal conctact
      // with all errors.
      let a = action.type.split('_');
      let typetype = a.pop();
      if (typetype === 'ERROR') {
        let op = a.pop();
        let errorHandler = module2errorHandler[module];
        console.log("using error-handler for '" + module + "' =", errorHandler);
        errorHandler(Object.assign({}, action.data, { op: op, error: action.error.message }));
      }

      // No change to state
      return state;
    }

    naiveErrorHandler(e) {
      alert("ERROR: in module '" + e.module + "', " +
            " operation '" + e.op + "' on " +
            " resource '" + e.resource + "' failed, saying: " + e.error);
    }

    componentDidMount() {
      this.props.refreshRemote({...this.props});
    }

    render () {
      return (
        <Wrapped {...this.props} />
      );
    }

  };

  Wrapper.contextTypes = {
    addReducer: React.PropTypes.func
  };

  Wrapper.mapState = function(state) {
    return {
      data: resources.reduce((result, resource) => {
        result[resource.name] = _.get(state, [resource.stateKey()], null);
        return result;
      }, {})
    };
  }

  Wrapper.mapDispatch = function(dispatch) {
    return {
      mutator: resources.reduce((result, resource) => {
        result[resource.name] = resource.getMutator(dispatch);
        return result;
      }, {}),
      refreshRemote: (params) => {
        resources.forEach(resource => {
          if (resource.refresh) {
            resource.refresh(dispatch, params);
          }
        });
      }
    };
  }

  return Wrapper;
}

export const connect = (Component, module) => {
  const Wrapper = wrap(Component, module);
  const Connected = reduxConnect(Wrapper.mapState, Wrapper.mapDispatch)(Wrapper);
  return Connected;
};

