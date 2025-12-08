import React, { useState, useEffect } from 'react';
import { Calendar, Trash2, Filter, Search, RefreshCw, CheckSquare, Square } from 'lucide-react';

const CalendarManager = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState(new Set());
  const [filters, setFilters] = useState({
    date: '',
    startDate: '',
    endDate: ''
  });

  const sessionId = localStorage.getItem('agent_session_id') || 'anonymous';

  useEffect(() => {
    fetchEvents();
  }, [filters]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ sessionId, ...filters });
      const response = await fetch(`http://localhost:4000/api/smart-assistant/calendar-events?${params}`);
      const data = await response.json();
      
      if (data.success) {
        setEvents(data.events);
      } else {
        console.error('Failed to fetch events:', data.error);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  const bulkDelete = async () => {
    if (selectedEvents.size === 0) {
      alert('Please select events to delete');
      return;
    }

    if (!confirm(`Delete ${selectedEvents.size} selected events?`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:4000/api/smart-assistant/calendar-events', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          eventIds: Array.from(selectedEvents)
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Deleted ${data.deleted} events${data.failed > 0 ? ` (${data.failed} failed)` : ''}`);
        setSelectedEvents(new Set());
        fetchEvents();
      } else {
        alert('Failed to delete events: ' + data.error);
      }
    } catch (error) {
      console.error('Error deleting events:', error);
      alert('Error deleting events');
    } finally {
      setLoading(false);
    }
  };

  const deleteByDate = async () => {
    if (!filters.date && !filters.startDate) {
      alert('Please select a date or date range');
      return;
    }

    if (!confirm(`Delete all events in selected date range?`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('http://localhost:4000/api/smart-assistant/calendar-events', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sessionId,
          ...filters
        })
      });

      const data = await response.json();
      
      if (data.success) {
        alert(`Deleted ${data.deleted} events${data.failed > 0 ? ` (${data.failed} failed)` : ''}`);
        fetchEvents();
      } else {
        alert('Failed to delete events: ' + data.error);
      }
    } catch (error) {
      console.error('Error deleting events:', error);
      alert('Error deleting events');
    } finally {
      setLoading(false);
    }
  };

  const toggleEventSelection = (eventId) => {
    const newSelected = new Set(selectedEvents);
    if (newSelected.has(eventId)) {
      newSelected.delete(eventId);
    } else {
      newSelected.add(eventId);
    }
    setSelectedEvents(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedEvents.size === events.length) {
      setSelectedEvents(new Set());
    } else {
      setSelectedEvents(new Set(events.map(event => event.id)));
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-500" />
            Google Calendar Manager
          </h1>
          <p className="text-gray-600 mt-1">View, filter, and bulk delete reminders from Google Calendar</p>
        </div>

        {/* Filters */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="font-medium text-gray-700">Filters</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Single Date</label>
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value, startDate: '', endDate: '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value, date: '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <button
              onClick={fetchEvents}
              disabled={loading}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            
            <button
              onClick={deleteByDate}
              disabled={loading || (!filters.date && !filters.startDate)}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-300 transition-colors flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete All in Range
            </button>
          </div>
        </div>

        {/* Actions */}
        {events.length > 0 && (
          <div className="p-6 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={toggleAllSelection}
                  className="flex items-center gap-2 px-3 py-1 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {selectedEvents.size === events.length ? (
                    <CheckSquare className="w-4 h-4" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  {selectedEvents.size === events.length ? 'Deselect All' : 'Select All'}
                </button>
                
                <span className="text-sm text-gray-600">
                  {selectedEvents.size} of {events.length} selected
                </span>
              </div>
              
              <button
                onClick={bulkDelete}
                disabled={loading || selectedEvents.size === 0}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-gray-300 transition-colors flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected ({selectedEvents.size})
              </button>
            </div>
          </div>
        )}

        {/* Events List */}
        <div className="p-6">
          {loading ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500" />
              <p className="text-gray-600 mt-2">Loading events...</p>
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-8">
              <Calendar className="w-12 h-12 mx-auto text-gray-400" />
              <p className="text-gray-600 mt-2">No events found</p>
              <p className="text-sm text-gray-500 mt-1">Try adjusting your filters or connect Google Calendar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => (
                <div
                  key={event.id}
                  className={`border rounded-lg p-4 transition-colors ${
                    selectedEvents.has(event.id) 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => toggleEventSelection(event.id)}
                      className="mt-1"
                    >
                      {selectedEvents.has(event.id) ? (
                        <CheckSquare className="w-4 h-4 text-blue-500" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                    
                    <div className="flex-1">
                      <h3 className="font-medium text-gray-900">{event.summary}</h3>
                      {event.description && (
                        <p className="text-sm text-gray-600 mt-1">{event.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                        <span>Start: {formatDate(event.start.dateTime || event.start.date)}</span>
                        {event.end && (
                          <span>End: {formatDate(event.end.dateTime || event.end.date)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CalendarManager;
