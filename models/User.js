import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
    telegramId: {
        type: String,
        required: true
    },
    subscribe: {
        type: Boolean,
        default: false
    },
    avatar: String,
    analysis: {
        videoUrl: String
    },
    trainingPlan: {
        type: Array,
        default: []
    }
}, {
    timestamps: true,
});

export default mongoose.model('User', UserSchema);
