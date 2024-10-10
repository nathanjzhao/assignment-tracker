import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const MAX_RETRIES = 3;

export default async function handler(req, res) {
  console.log('Extracting assignments from text');
  if (req.method === 'POST') {
    let retries = 0;
    while (retries < MAX_RETRIES) {
      try {
        const { text } = req.body;
        if (!text || typeof text !== 'string') {
          throw new Error('Invalid input: text is required and must be a string');
        }


        const currentYear = new Date().getFullYear();
        const currentMonth = new Date().getMonth() + 1;
        const chatGPTResponse = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {role: "system", content: "You are a helpful assistant that extracts detailed assignment and exam information from course syllabi or other course-related text."},
            {role: "user", content: `Extract all assignments and exams with their details from the following text. Format the output as a JSON array of objects, each with properties:
            - assignmentName: string (the formal name of the assignment as listed in the text). In title case and not including the class name. If not specified, use "Unnamed Assignment".
            - dueDate: string (in YYYY-MM-DD format, or 'TBD' if not specified)
            - releaseDate: string (in YYYY-MM-DD format, or 'TBD' if not specified). If year is not specified, use the closest date to the current month (${currentMonth} ${currentYear}).
            - timeNeeded: number (estimated time needed in minutes, or 0 if not specified)
            - classId: string (the formal course code or name, e.g., 'CS 101', 'EE 16A', or class name if not specified). If not found, use 'Unknown'.
            - status: number (percentage of completion, default to 0)
            Ensure all fields are filled. If any information is not available, use the specified default values. Output only the JSON array, nothing else.\n\nInput text:\n${text}`}
          ],
          temperature: 0.3,
        });

        const rawContent = chatGPTResponse.choices[0].message.content;
        let extractedData;
        try {
          // First, try to parse the entire content as JSON
          extractedData = JSON.parse(rawContent);
        } catch (error) {
          // If that fails, attempt to extract JSON from within ```json ``` tags
          const jsonMatch = rawContent.match(/```json\s*([\s\S]*?)\s*```/);
          if (jsonMatch && jsonMatch[1]) {
            extractedData = JSON.parse(jsonMatch[1].trim());
          } else {
            throw new Error('Failed to parse JSON from the response');
          }
        }

        // Ensure extractedData is an array
        if (!Array.isArray(extractedData)) {
          throw new Error('Parsed data is not an array');
        }

        const assignments = extractedData.map(item => ({
          assignmentName: item.assignmentName || 'Unnamed Assignment',
          dueDate: item.dueDate || 'TBD',
          releaseDate: item.releaseDate || 'TBD',
          timeNeeded: item.timeNeeded || 0,
          classId: item.classId || 'Unknown',
          status: item.status || 0,
          complete: false
        }));

        console.log('Extracted assignments:', assignments);
        res.status(200).json(assignments);
        return;
      } catch (error) {
        console.error(`Error in extract-assignments (attempt ${retries + 1}):`, error);
        retries++;
        if (retries >= MAX_RETRIES) {
          res.status(500).json({ error: 'Failed to extract assignments', details: error.message });
          return;
        }
      }
    }
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}