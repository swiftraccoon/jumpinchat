require('core-js/stable');

const Enzyme = require('enzyme');
const Adapter = require('@wojtekmaj/enzyme-adapter-react-17');

console.log = () => {};
Enzyme.configure({ adapter: new Adapter() });
