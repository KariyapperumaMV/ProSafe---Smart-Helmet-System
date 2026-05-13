const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true
  },
  name: String,

  nic:{
    type:String,
    unique: true
  },

  phoneNo: String,

  email: String,
  
  password: String,

  user_type: {
    type: String,
    enum: ["ADMIN", "WORKER"],
    required: true
  },

  helmet: {
    //type: mongoose.Schema.Types.ObjectId,
    //ref: "Helmet",
    type: String,
    default: null
  }
});

module.exports = mongoose.model("User", userSchema);