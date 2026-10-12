package ai.drishti.app.sensors

import kotlin.math.sqrt

/**
 * Ported from ANVI (https://github.com/naimulRakib/ANVI).
 * ArcFace Face Recognition Vector Comparison Helper.
 * Handles L2 normalization and cosine similarity matching between facial feature descriptors.
 */
object ArcFaceHelper {

    /**
     * Calculates cosine similarity between two feature vectors:
     * dot(a, b) / (sqrt(normA) * sqrt(normB))
     */
    fun cosineSimilarity(a: FloatArray, b: FloatArray): Float {
        if (a.isEmpty() || b.isEmpty() || a.size != b.size) return 0f

        var dot = 0f
        var normA = 0f
        var normB = 0f

        for (i in a.indices) {
            dot += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }

        val denominator = sqrt(normA) * sqrt(normB)
        return if (denominator > 0f) dot / denominator else 0f
    }

    /**
     * Normalizes a vector using L2-norm (unit length).
     */
    fun l2Normalize(embedding: FloatArray): FloatArray {
        var sum = 0f
        for (v in embedding) sum += v * v
        val norm = sqrt(sum)

        if (norm <= 0f) return embedding.clone()

        val normalized = FloatArray(embedding.size)
        for (i in embedding.indices) {
            normalized[i] = embedding[i] / norm
        }
        return normalized
    }

    /**
     * Compares a query face vector against enrolled member vectors.
     * Returns the name of the highest scoring member above threshold, or null if below threshold.
     */
    fun matchPerson(
        queryVector: FloatArray,
        enrolledProfiles: Map<String, FloatArray>,
        threshold: Float = 0.70f
    ): Pair<String, Float>? {
        var bestMatch: Pair<String, Float>? = null
        var highestScore = -1f

        for ((name, enrolledVec) in enrolledProfiles) {
            val score = cosineSimilarity(queryVector, enrolledVec)
            if (score > highestScore) {
                highestScore = score
                bestMatch = Pair(name, score)
            }
        }

        return if (bestMatch != null && bestMatch.second >= threshold) {
            bestMatch
        } else {
            null
        }
    }
}
