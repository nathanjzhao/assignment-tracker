import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export function AssignmentForm({ onSubmit, initialData, onCancel }) {
  const [assignment, setAssignment] = useState(initialData || {
    dueDate: '',
    timeNeeded: 0,
    classId: '',
    assignmentName: '',
    status: 0,
    complete: false,
    releaseDate: ''
  })

  const handleChange = (field, value) => {
    setAssignment(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(assignment)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        type="date"
        value={assignment.dueDate}
        onChange={(e) => handleChange('dueDate', e.target.value)}
        placeholder="Due Date"
      />
      <Input
        type="number"
        value={assignment.timeNeeded}
        onChange={(e) => handleChange('timeNeeded', parseInt(e.target.value))}
        placeholder="Time Needed (min)"
      />
      <Select
        value={assignment.classId}
        onValueChange={(value) => handleChange('classId', value)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Select Class" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="CS 224W">CS 224W</SelectItem>
          <SelectItem value="CS 149">CS 149</SelectItem>
          <SelectItem value="EE 227">EE 227</SelectItem>
        </SelectContent>
      </Select>
      <Input
        value={assignment.assignmentName}
        onChange={(e) => handleChange('assignmentName', e.target.value)}
        placeholder="Assignment Name"
      />
      <Input
        type="number"
        value={assignment.status}
        onChange={(e) => handleChange('status', parseInt(e.target.value))}
        placeholder="Status (%)"
      />
      <Input
        type="date"
        value={assignment.releaseDate}
        onChange={(e) => handleChange('releaseDate', e.target.value)}
        placeholder="Release Date"
      />
      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  )
}