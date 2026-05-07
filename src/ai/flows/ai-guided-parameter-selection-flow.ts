'use server';
/**
 * @fileOverview This file defines a Genkit flow for suggesting environmental parameters and their typical value ranges.
 *
 * - aiGuidedParameterSelection - A function that handles the parameter suggestion process.
 * - AiGuidedParameterSelectionInput - The input type for the aiGuidedParameterSelection function.
 * - AiGuidedParameterSelectionOutput - The return type for the aiGuidedParameterSelection function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const AiGuidedParameterSelectionInputSchema = z.object({
  latitude: z.number().describe('The latitude of the sampling location.'),
  longitude: z.number().describe('The longitude of the sampling location.'),
  environmentalMedium: z.enum(['water', 'air', 'soil']).describe('The type of environmental medium being sampled (water, air, or soil).'),
});
export type AiGuidedParameterSelectionInput = z.infer<typeof AiGuidedParameterSelectionInputSchema>;

const AiGuidedParameterSelectionOutputSchema = z.object({
  parameters: z.array(
    z.object({
      name: z.string().describe('The name of the suggested environmental parameter (e.g., pH, PM2.5, Organic Matter).'),
      typicalRange: z.string().describe('The typical value range for this parameter (e.g., "6.5-8.5 pH units", "10-50 µg/m³", "2-5% mass").'),
      rationale: z.string().describe('A brief explanation of why this parameter is relevant for the given medium and location.'),
    })
  ).describe('A list of suggested environmental parameters with their typical ranges and rationale.'),
  overallRationale: z.string().describe('An overall explanation for the selection of parameters based on the input.'),
});
export type AiGuidedParameterSelectionOutput = z.infer<typeof AiGuidedParameterSelectionOutputSchema>;

export async function aiGuidedParameterSelection(input: AiGuidedParameterSelectionInput): Promise<AiGuidedParameterSelectionOutput> {
  return aiGuidedParameterSelectionFlow(input);
}

const parameterSuggestionPrompt = ai.definePrompt({
  name: 'parameterSuggestionPrompt',
  input: { schema: AiGuidedParameterSelectionInputSchema },
  output: { schema: AiGuidedParameterSelectionOutputSchema },
  prompt: `You are an expert environmental scientist specializing in monitoring and data collection. Your task is to suggest relevant environmental parameters and their typical value ranges for a given sampling location and environmental medium.

Consider the following information:
- Environmental Medium: {{{environmentalMedium}}}
- Location (Latitude, Longitude): ({{{latitude}}}, {{{longitude}}})

Based on this information, provide a list of 5-7 key environmental parameters that should typically be monitored for the specified medium and location. For each parameter, include its name, a typical value range (e.g., "6.5-8.5 pH units", "10-50 µg/m³"), and a brief rationale for its inclusion. Also, provide an overall rationale for your parameter suggestions.

Focus on common and important parameters relevant to general environmental health for the specified medium. If specific geographical context is limited, use general best practices for monitoring. Ensure the typical ranges are realistic for common environmental conditions.

Example Output Format:
{
  "parameters": [
    {
      "name": "pH",
      "typicalRange": "6.5-8.5 pH units",
      "rationale": "pH is a fundamental parameter influencing chemical and biological processes in water."
    },
    {
      "name": "Dissolved Oxygen (DO)",
      "typicalRange": "5-10 mg/L",
      "rationale": "DO is crucial for aquatic life and indicates water quality."
    }
  ],
  "overallRationale": "The suggested parameters cover key indicators of water quality and ecosystem health."
}`,
});

const aiGuidedParameterSelectionFlow = ai.defineFlow(
  {
    name: 'aiGuidedParameterSelectionFlow',
    inputSchema: AiGuidedParameterSelectionInputSchema,
    outputSchema: AiGuidedParameterSelectionOutputSchema,
  },
  async (input) => {
    const { output } = await parameterSuggestionPrompt(input);
    return output!;
  }
);
