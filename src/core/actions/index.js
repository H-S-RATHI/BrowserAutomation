const { handleNavigate } = require('./navigate');
const { handleSearch } = require('./search');
const { handleClick } = require('./click');
const { handleType } = require('./type');
const { handleExtract } = require('./extract');
const { handleWait } = require('./wait');
const { handleScroll } = require('./scroll');
const { handleSelectorFinder } = require('./selectorFinder');

module.exports = {
    handleNavigate,
    handleSearch,
    handleClick,
    handleType,
    handleExtract,
    handleWait,
    handleScroll,
    handleSelectorFinder
};
