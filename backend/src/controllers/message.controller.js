import cloudinary from "../lib/cloudinary.js";
import { getReceiverSocketId, io } from "../lib/socket.js";
import Message from "../models/message.model.js";
import User from "../models/user.model.js";

export const getUsersForSidebar = async (req, res) => {
  try {
    const users = await User.find({ _id: { $ne: req.user.id } }) // Exclude self
      .lean();

    // Get the latest message timestamp for each user
    for (let user of users) {
      const lastMessage = await Message.findOne({
        $or: [
          { senderId: req.user.id, receiverId: user._id },
          { senderId: user._id, receiverId: req.user.id },
        ],
      })
        .sort({ createdAt: -1 }) // Latest message first
        .select("createdAt");

      user.lastMessageAt = lastMessage ? lastMessage.createdAt : new Date(0);
    }

    // Sort users based on the latest message timestamp (descending order)
    users.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    res.status(201).json(users);
  } catch (error) {
    res.status(500).json({ message: "Error fetching users" });
  }
};


export const getMessages = async (req, res) => {
    try {
        const { id: userToChatId } = req.params;
        const myId = req.user._id;

        const messages = await Message.find({
            $or: [
                { senderId : myId, receiverId: userToChatId },
                { senderId: userToChatId, receiverId: myId },
            ],
        })

        res.status(200).json(messages);
    } catch (error) {
        console.log("Error in getMessages: ", error.message);
        res.status(500).json({ message: "Internal server error  "});
    }
}

export const sendMessage = async (req, res) => {
    try {
        const {text, image} = req.body;
        const { id: receiverId } = req.params;
        const senderId = req.user._id;

        let imageUrl;
        if(image){
            //upload base 64 image to cloudinary
            const uploadResponse = await cloudinary.uploader.upload(image);
            imageUrl = uploadResponse.secure_url;
        }

        const newMessage = new Message({
            senderId,
            receiverId,
            text,
            image: imageUrl,
        });

        await newMessage.save();

        // Emit real-time event to the receiver
        io.to(receiverId).emit("newMessage", { senderId, text });

        //realtime functionality goes here -> socket.io
        const receiverSocketId = getReceiverSocketId(receiverId);
        if(receiverSocketId){
            io.to(receiverSocketId).emit("newMessage", newMessage);
        }

        res.status(200).json(newMessage);
    } catch (error) {
        console.log("Error in sendMessage: ", error.message);
        res.status(500).json({ message: "Internal server error" });
    }
}