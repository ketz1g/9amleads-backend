// Planning Provider Interface
// All planning data providers must implement this interface.
// To add a new provider, create a module that exports the same functions.

const providers = {};

// Register a provider
function register(name, implementation) {
  providers[name] = implementation;
}

// Get a registered provider
function get(name) {
  return providers[name];
}

// List registered providers
function list() {
  return Object.keys(providers);
}

module.exports = { register, get, list };
