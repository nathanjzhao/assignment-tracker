import OpenAI from 'openai';
import formidable from 'formidable';
import fs from 'fs/promises';  // Use promises version of fs

export const config = {
  api: {
    bodyParser: false,  // Disable body parsing to allow formidable to handle file uploads
  },
};

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  console.log('Extracting assignments from image');

  if (req.method === 'POST') {
    try {
      // Parse the form data with promise-based formidable
      const form = formidable({ multiples: true });  // Allow multiple file uploads if needed
      const { fields, files } = await new Promise((resolve, reject) => {
        form.parse(req, (err, fields, files) => {
          if (err) reject(err);
          resolve({ fields, files });
        });
      });

      // Read the image file
      const imageFile = files.image[0];  // formidable returns files as an array, pick the first one
      const imageBuffer = await fs.readFile(imageFile.filepath);
      const base64Image = imageBuffer.toString('base64');

      // Use OpenAI with vision capabilities to process the image
      const chatGPTResponse = await openai.chat.completions.create({
        model: "gpt-4-turbo",
        messages: [
          {
            role: "user",
            content: `Extract all assignments and exams with their details from this image. Format the output as a JSON array of objects, each with properties: 
            - assignmentName: string (the formal name of the assignment as listed in the image). In title case and not including the class name.
            - dueDate: string (in YYYY-MM-DD format, or 'TBD' if not specified)
            - releaseDate: string (in YYYY-MM-DD format, or 'TBD' if not specified)
            - timeNeeded: number (estimated time needed in minutes, or 0 if not specified)
            - classId: string (the formal course code or name, e.g., 'CS 101', 'EE 16A', or class name if not specified). Otherwise, use 'Unknown'.
            - status: number (percentage of completion, default to 0)
            
            If any information is not available, use appropriate default values. \n\nImage data:\n`,
          },
          {
            role: "user",
            content: `data:image/jpeg;base64,${base64Image}`
          }
        ],
        max_tokens: 1000,
      });

      // Extract and parse JSON content from the GPT response
      const rawContent = chatGPTResponse.choices[0].message.content;
      const jsonStartIndex = rawContent.indexOf('[');
      const jsonEndIndex = rawContent.lastIndexOf(']') + 1;
      const jsonString = rawContent.substring(jsonStartIndex, jsonEndIndex);
      const extractedData = JSON.parse(jsonString);

      // Process the extracted data
      const assignments = extractedData.map(item => ({
        assignmentName: item.assignmentName,
        dueDate: item.dueDate || 'TBD',
        releaseDate: item.releaseDate || 'TBD',
        timeNeeded: item.timeNeeded || 0,
        classId: item.classId || 'Unknown',
        status: item.status || 0,
        complete: false
      }));

      console.log('Extracted assignments:', assignments);
      res.status(200).json(assignments);
    } catch (error) {
      console.error('Error in extract-from-image:', error);
      res.status(500).json({ error: 'Failed to extract assignments from image', details: error.message });
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
