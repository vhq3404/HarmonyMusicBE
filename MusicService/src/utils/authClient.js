const axios = require("axios");

exports.getUserById = async (userId) => {
  const res = await axios.get(
    `${process.env.AUTH_SERVICE_URL}/api/users/${userId}`
  );

  return res.data.user;
};
